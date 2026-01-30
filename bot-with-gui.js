// bot-with-gui.js - Revolt Bot with Web GUI
import { chromium } from 'playwright';
import express from 'express';
import { Server } from 'socket.io';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Configuration ---
const SERVER_NAMES = {
    "01K0BN10KK2MQ240QS667NVPDD": "FreshClub",
    "01JDPY161J6H6B1KBV74QWKCDM": "VIP",
    "01K7A7TBZ4SJKNXX47H9MHF6V7": "TGC",
    "01JDN56CS41PQ3XGVN9TF62G04": "Volcano",
    "01JDKW51QNYPCCXK3S68ZD128E": "Feast",
    "01JDKH82R0RHG2VF9YDWKEFHC5": "CE"
};

const TARGET_SERVER_IDS = Object.keys(SERVER_NAMES);

// Create Express app and HTTP server
const app = express();
const server = createServer(app);
const io = new Server(server);

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Bot state
let botState = {
    isRunning: false,
    isPaused: false,
    isArmed: false,
    authToken: null,
    browser: null,
    context: null,
    page: null,
    stats: {
        channelsProcessed: 0,
        messagesSent: 0,
        errors: 0
    },
    logs: []
};

// Add log function to capture and emit logs
function addLog(level, message) {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = { timestamp, level, message };
    botState.logs.push(logEntry);
    
    // Keep only the last 100 logs
    if (botState.logs.length > 100) {
        botState.logs.shift();
    }
    
    // Emit to all connected clients
    io.emit('log', logEntry);
    console.log(`[${level}] ${message}`);
}

// API routes
app.get('/api/status', (req, res) => {
    res.json({
        isRunning: botState.isRunning,
        isPaused: botState.isPaused,
        isArmed: botState.isArmed,
        stats: botState.stats,
        servers: SERVER_NAMES
    });
});

app.post('/api/start', async (req, res) => {
    if (botState.isRunning) {
        return res.status(400).json({ error: 'Bot is already running' });
    }
    
    try {
        await startBot();
        res.json({ success: true });
    } catch (error) {
        addLog('ERROR', `Failed to start bot: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/stop', async (req, res) => {
    if (!botState.isRunning) {
        return res.status(400).json({ error: 'Bot is not running' });
    }
    
    try {
        await stopBot();
        res.json({ success: true });
    } catch (error) {
        addLog('ERROR', `Failed to stop bot: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/pause', (req, res) => {
    if (!botState.isRunning || !botState.isArmed) {
        return res.status(400).json({ error: 'Bot is not running or armed' });
    }
    
    botState.isPaused = true;
    if (botState.page) {
        botState.page.evaluate(() => window.setPauseState(true));
    }
    addLog('INFO', 'Bot paused');
    
    // --- FIX: Emit state change to GUI ---
    io.emit('state', botState);
    
    res.json({ success: true });
});

app.post('/api/resume', (req, res) => {
    if (!botState.isRunning || !botState.isArmed) {
        return res.status(400).json({ error: 'Bot is not running or armed' });
    }
    
    botState.isPaused = false;
    if (botState.page) {
        botState.page.evaluate(() => window.setPauseState(false));
    }
    addLog('INFO', 'Bot resumed');
    
    // --- FIX: Emit state change to GUI ---
    io.emit('state', botState);
    
    res.json({ success: true });
});

app.post('/api/arm', async (req, res) => {
    if (!botState.isRunning || botState.isArmed) {
        return res.status(400).json({ error: 'Bot is not running or already armed' });
    }
    
    try {
        await armBot();
        res.json({ success: true });
    } catch (error) {
        addLog('ERROR', `Failed to arm bot: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    addLog('INFO', 'GUI connected');
    
    // Send current state to the newly connected client
    socket.emit('state', botState);
    
    socket.on('disconnect', () => {
        addLog('INFO', 'GUI disconnected');
    });
});

// Bot functions
async function startBot() {
    addLog('INFO', 'Starting Revolt Bot...');
    
    botState.browser = await chromium.launch({ 
        headless: false,
        args: [
            '--disable-blink-features=AutomationControlled',
            '--disable-service-workers'
        ]
    });

    botState.context = await botState.browser.newContext({
        viewport: { width: 1600, height: 900 },
        locale: 'en-US'
    });

    botState.page = await botState.context.newPage();
    
    // Forward browser console logs to our log system
    botState.page.on('console', msg => {
        if (msg.type() === 'log') {
            addLog('BROWSER', msg.text());
        }
    });
    
    // Inject the bot logic
    await injectBotLogic();
    
    // Navigate to Revolt
    await botState.page.goto('https://revolt.onech.at');
    
    botState.isRunning = true;
    addLog('INFO', 'Bot started. Please log in to your account.');
    
    // Emit state change
    io.emit('state', botState);
}

async function stopBot() {
    addLog('INFO', 'Stopping bot...');
    
    if (botState.browser) {
        await botState.browser.close();
        botState.browser = null;
        botState.context = null;
        botState.page = null;
    }
    
    botState.isRunning = false;
    botState.isPaused = false;
    botState.isArmed = false;
    botState.authToken = null;
    
    // Reset stats
    botState.stats = {
        channelsProcessed: 0,
        messagesSent: 0,
        errors: 0
    };
    
    // Emit state change
    io.emit('state', botState);
    
    addLog('INFO', 'Bot stopped');
}

async function armBot() {
    if (!botState.page) {
        throw new Error('Bot page is not available');
    }
    
    addLog('INFO', 'Fetching authentication token from IndexedDB...');
    
    botState.authToken = await botState.page.evaluate(() => {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('localforage');
            request.onsuccess = () => {
                const db = request.result;
                const tx = db.transaction(['keyvaluepairs'], 'readonly');
                const store = tx.objectStore('keyvaluepairs');
                const getAllRequest = store.getAll();
                getAllRequest.onsuccess = () => {
                    const allValues = getAllRequest.result;
                    let foundToken = null;
                    for (const value of allValues) {
                        if (value && value.sessions) {
                            const sessionsObject = value.sessions;
                            const userIdKey = Object.keys(sessionsObject)[0];
                            if (userIdKey && sessionsObject[userIdKey] && sessionsObject[userIdKey].session) {
                                foundToken = sessionsObject[userIdKey].session.token;
                                break;
                            }
                        }
                    }
                    if (foundToken) {
                        resolve(foundToken);
                    } else {
                        reject(new Error('Could not find session token within any of the values in IndexedDB.'));
                    }
                };
                getAllRequest.onerror = () => reject(getAllRequest.error);
            };
            request.onerror = () => reject(request.error);
        });
    });

    if (botState.authToken) {
        addLog('INFO', 'Successfully fetched token!');
    } else {
        throw new Error('Could not find token. The bot will not work.');
    }

    // Arm the bot with token and server info
    addLog('INFO', 'Arming the bot with token and server information...');
    await botState.page.evaluate(({ token, targetServerIds, serverNames }) => {
        window.authToken = token;
        window.targetServerIds = targetServerIds;
        window.serverNames = serverNames;
        window.generateNonce = () => Date.now().toString(36) + Math.random().toString(36).substring(2);
        console.log('[Bot Script] Bot is ARMED and ready. De-duplicating listener is active.');
    }, { 
        token: botState.authToken, 
        targetServerIds: TARGET_SERVER_IDS, 
        serverNames: SERVER_NAMES 
    });
    
    botState.isArmed = true;
    addLog('INFO', 'Bot is now armed and ready!');
    
    // Emit state change
    io.emit('state', botState);
}

async function injectBotLogic() {
    addLog('INFO', 'Injecting bot logic...');
    
    await botState.context.addInitScript(() => {
        // Helper function to get current local time as a formatted string
        window.getLocalTime = () => {
            const now = new Date();
            return now.toLocaleString();
        };
        
        console.log('[Bot Script] Logic injected. Initializing queue and de-duplicator...');
        
        // --- THE DE-DUPLICATION SYSTEM ---
        window.processedChannelIds = new Set(); // Use a Set for fast lookups
        window.channelQueue = [];
        let isProcessing = false;
        let isPaused = false;

        // Function to pause/resume the bot
        window.setPauseState = (paused) => {
            isPaused = paused;
            console.log(`[Bot Script] ${paused ? '⏸️ Bot PAUSED - ignoring new channels' : '▶️ Bot RESUMED - processing new channels'}`);
            
            if (paused) {
                // Clear the queue when pausing to discard any pending channels
                window.channelQueue = [];
                console.log('[Bot Script] Queue cleared - channels created during pause will be ignored');
            } else if (window.channelQueue.length > 0 && !isProcessing) {
                // Only process if there are channels in the queue and not already processing
                window.processQueue();
            }
        };

        window.processQueue = async () => {
            if (isProcessing || isPaused || window.channelQueue.length === 0) {
                return;
            }

            isProcessing = true;
            const data = window.channelQueue.shift(); 
            console.log(`[Bot Script] Processing from queue. ${window.channelQueue.length} items remaining.`);

            const channelId = data._id;
            const channelName = data.name;
            const serverId = data.server;
            const serverName = window.serverNames[serverId] || "Unknown";
            
            console.log(`[Bot Script] 🎯 Channel: ${channelName}, Server: ${serverName} (${serverId})`);

            const apiChannelUrl = `https://revolt-api.onech.at/channels/${channelId}/messages`;
            
            try {
                // Check which server this channel belongs to and send appropriate messages
                if (serverId === "01JDKH82R0RHG2VF9YDWKEFHC5") {
                    // CE server: send /claim 3 times then /claim .3
                    console.log(`[Bot Script] 🚀 Sending 4 messages to CE server...`);
                    
                    // Send /claim 3 times without delays
                    for (let i = 1; i <= 3; i++) {
                        const payload = { content: '/claim', nonce: window.generateNonce(), replies: [] };
                        console.log(`[Bot Script] 🚀 Sending via Fetch (${i}/4): ${JSON.stringify(payload)}`);
                        
                        const response = await fetch(apiChannelUrl, {
                            method: 'POST', headers: { 'Content-Type': 'application/json', 'x-session-token': window.authToken },
                            body: JSON.stringify(payload)
                        });
                        
                        console.log(`[Bot Script] 📡 API Response (${i}/4) Status: ${response.status} ${response.statusText}`);
                        if (!response.ok) {
                            const errorText = await response.text();
                            console.log(`[Bot Script] ❌ API Error Response (${i}/4): ${errorText}`);
                        } else {
                            // For successful responses, let's check if there's a message ID in the response
                            const responseData = await response.json();
                            if (responseData._id) {
                                console.log(`[Bot Script] ✅ Message ${i}/4 sent successfully with ID: ${responseData._id}`);
                            } else {
                                console.log(`[Bot Script] ⚠️ Message ${i}/4 appeared to send but no message ID was returned`);
                            }
                        }
                        // No delay between these messages
                    }
                    
                    // Random delay between 1200ms and 1500ms before sending the final message
                    const finalDelay = 1200 + Math.random() * 300;
                    console.log(`[Bot Script] ⏱️ Waiting ${Math.round(finalDelay)}ms before sending final message...`);
                    await new Promise(resolve => setTimeout(resolve, finalDelay));
                    
                    // Send /claim .3
                    const finalPayload = { content: '/claim .3', nonce: window.generateNonce(), replies: [] };
                    console.log(`[Bot Script] 🚀 Sending via Fetch (4/4): ${JSON.stringify(finalPayload)}`);
                    
                    const finalResponse = await fetch(apiChannelUrl, {
                        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-session-token': window.authToken },
                        body: JSON.stringify(finalPayload)
                    });
                    
                    console.log(`[Bot Script] 📡 API Response (4/4) Status: ${finalResponse.status} ${finalResponse.statusText}`);
                    if (!finalResponse.ok) {
                        const errorText = await finalResponse.text();
                        console.log(`[Bot Script] ❌ API Error Response (4/4): ${errorText}`);
                    } else {
                        // For successful responses, let's check if there's a message ID in the response
                        const responseData = await response.json();
                        if (responseData._id) {
                            console.log(`[Bot Script] ✅ Final message sent successfully with ID: ${responseData._id}`);
                        } else {
                            console.log(`[Bot Script] ⚠️ Final message appeared to send but no message ID was returned`);
                        }
                    }
                    
                    console.log(`[Bot Script] ✅ Successfully sent all messages to ${serverName} at ${window.getLocalTime()}`);
                } else {
                    // For all other servers (Volcano, Feast, FreshClub, VIP, TGC), send message with a delay
                    console.log(`[Bot Script] 🚀 Preparing to send message to ${serverName} server...`);
                    
                    // Random delay between 800ms and 1200ms before sending the message
                    const delay = 800 + Math.random() * 400;
                    console.log(`[Bot Script] ⏱️ Waiting ${Math.round(delay)}ms before sending message...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    
                    // Determine the correct message for the server
                    let messageContent = '.3'; // Default message
                    if (serverId === "01JDN56CS41PQ3XGVN9TF62G04" || serverId === "01JDKW51QNYPCCXK3S68ZD128E") {
                        messageContent = '/claim .3'; // Message for Volcano and Feast
                    }
                    
                    const payload = { content: messageContent, nonce: window.generateNonce(), replies: [] };
                    console.log(`[Bot Script] 🚀 Sending via Fetch: ${JSON.stringify(payload)}`);
                    
                    const response = await fetch(apiChannelUrl, {
                        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-session-token': window.authToken },
                        body: JSON.stringify(payload)
                    });
                    
                    console.log(`[Bot Script] 📡 API Response Status: ${response.status} ${response.statusText}`);
                    if (!response.ok) {
                        const errorText = await response.text();
                        console.log(`[Bot Script] ❌ API Error Response: ${errorText}`);
                    } else {
                        // For successful responses, let's check if there's a message ID in the response
                        const responseData = await response.json();
                        if (responseData._id) {
                            console.log(`[Bot Script] ✅ Message sent successfully with ID: ${responseData._id}`);
                        } else {
                            console.log(`[Bot Script] ⚠️ Message appeared to send but no message ID was returned`);
                        }
                    }
                }

            } catch (error) {
                console.error(`[Bot Script] ❌ An error occurred during fetch: ${error.message}`);
            } finally {
                setTimeout(() => {
                    isProcessing = false;
                    if (!isPaused) {
                        window.processQueue();
                    }
                }, 50);
            }
        };

        const OriginalWebSocket = window.WebSocket;
        Object.defineProperty(window, 'WebSocket', {
            get() {
                return new Proxy(OriginalWebSocket, {
                    construct(target, args) {
                        const ws = new target(...args);
                        ws.addEventListener('message', (event) => {
                            if (isProcessing) return;
                            try {
                                const data = JSON.parse(event.data);
                                if (data.type === "ChannelCreate" && window.targetServerIds.includes(data.server)) {
                                    // --- THE DE-DUPLICATION CHECK ---
                                    if (window.processedChannelIds.has(data._id)) {
                                        console.log(`[Bot Script] Duplicate event for channel ${data._id}. Ignoring.`);
                                        return;
                                    }

                                    // If the bot is paused, ignore new channels completely
                                    if (isPaused) {
                                        console.log(`[Bot Script] Bot is paused - ignoring new channel in ${window.serverNames[data.server] || "Unknown"}`);
                                        return;
                                    }

                                    // Mark this channel ID as processed
                                    window.processedChannelIds.add(data._id);
                                    const serverName = window.serverNames[data.server] || "Unknown";
                                    console.log(`[Bot Script] New event detected in ${serverName}! Adding to queue...`);
                                    window.channelQueue.push(data);
                                    window.processQueue();
                                }
                            } catch (e) { /* Ignore parsing errors */ }
                        });
                        return ws;
                    }
                });
            },
            set() {
                console.warn('[Bot Script] Attempt to overwrite window.WebSocket was blocked.');
            }
        });
        console.log('[Bot Script] WebSocket proxy and de-duplicator are in place.');
    });
    
    addLog('INFO', 'Bot logic injected successfully');
}

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    addLog('INFO', `Server running on http://localhost:${PORT}`);
    console.log(`GUI available at http://localhost:${PORT}`);
});