// bot.js - Modified for The Goonery Only
import { chromium } from 'playwright';
import readline from 'readline';

// --- Configuration ---
// Only The Goonery server is now targeted
const SERVER_NAMES = {
    "01JDKAFHS1W2BTPSS9YDB6WNEP": "The Goonery"
};

const TARGET_SERVER_IDS = Object.keys(SERVER_NAMES);

console.log("--- Starting Revolt Bot (The Goonery Version) ---");

// Helper function to generate a unique nonce
function generateNonce() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

// Helper function to get current local time as a formatted string
function getLocalTime() {
    const now = new Date();
    return now.toLocaleString();
}

(async () => {
    const browser = await chromium.launch({ 
        headless: false,
        args: [
            '--disable-blink-features=AutomationControlled',
            '--disable-service-workers'
        ]
    });

    const context = await browser.newContext({
        viewport: { width: 1600, height: 900 },
        locale: 'en-US'
    });

    const page = await context.newPage();
    
    // Forward browser console logs to the Node.js terminal
    page.on('console', msg => {
        if (msg.type() === 'log') {
            console.log(msg.text());
        }
    });
    console.log("🔊 Listening for browser console messages...");

    // --- Part 0: Inject the bot logic ---
    console.log("🧠 Injecting the bot logic for The Goonery...");
    await context.addInitScript(() => {
        // Helper function to get current local time as a formatted string
        window.getLocalTime = () => {
            const now = new Date();
            return now.toLocaleString();
        };
        
        console.log('[Bot Script] Logic injected. Initializing queue and de-duplicator for The Goonery...');
        
        // --- DE-DUPLICATION SYSTEM ---
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

            const apiChannelUrl = `https://workers.api.onech.at/channels/${channelId}/messages`;
            
            try {
                // --- SERVER-SPECIFIC BEHAVIOR ---
                // Since we are only targeting The Goonery, we don't need conditional checks.
                // The serverId check in the WebSocket listener already ensures we only get events for this server.
                const message = '.3';
                const delay = 250 + Math.random() * 100; // 250-350ms delay
                console.log(`[Bot Script] 🚀 Preparing to send message to The Goonery...`);
                
                console.log(`[Bot Script] ⏱️ Waiting ${Math.round(delay)}ms before sending message...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                
                const payload = { content: message, nonce: window.generateNonce(), replies: [] };
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
                    const responseData = await response.json();
                    if (responseData._id) {
                        console.log(`[Bot Script] ✅ Message sent successfully with ID: ${responseData._id}`);
                    } else {
                        console.log(`[Bot Script] ⚠️ Message appeared to send but no message ID was returned`);
                    }
                }
                
                console.log(`[Bot Script] ✅ Successfully sent message to ${serverName} at ${window.getLocalTime()}`);

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
                            // No need to check isProcessing here, the queue handles it
                            try {
                                const data = JSON.parse(event.data);
                                if (data.type === "ChannelCreate" && window.targetServerIds.includes(data.server)) {
                                    // --- DE-DUPLICATION CHECK ---
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
    
    // --- Part 1: Log in and fetch token ---
    await page.goto('https://workers.onech.at');
    
    console.log("Please log in to your account now.");
    console.log("Once you are successfully logged in and can see the app, press ENTER in this terminal to ACTIVATE the bot.");
    
    // Wait for user to press ENTER after logging in
    await new Promise(resolve => {
        process.stdin.once('data', () => {
            resolve();
        });
    });
    
    console.log("✅ Login confirmed. Fetching authentication token from IndexedDB...");

    const authToken = await page.evaluate(() => {
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

    if (authToken) {
        console.log(`✅ Successfully fetched token!`);
    } else {
        console.error("❌ Could not find token. The bot will not work.");
        return;
    }

    // --- Part 2: "Arm" the bot ---
    console.log("🔐 Arming the bot with token, server ID, and helper function...");
    await page.evaluate(({ token, targetServerIds, serverNames }) => {
        window.authToken = token;
        window.targetServerIds = targetServerIds;
        window.serverNames = serverNames;
        window.generateNonce = () => Date.now().toString(36) + Math.random().toString(36).substring(2);
        console.log('[Bot Script] Bot is ARMED and ready. De-duplicating listener is active for The Goonery.');
        console.log('[Bot Script] Monitoring servers:');
        for (const [serverId, serverName] of Object.entries(serverNames)) {
            console.log(`[Bot Script] - ${serverName} (${serverId})`);
        }
    }, { token: authToken, targetServerIds: TARGET_SERVER_IDS, serverNames: SERVER_NAMES });

    console.log("🚀 Bot is now running for The Goonery. Good luck!");
    
    // Set up command line interface for pause/resume
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.on('line', async (input) => {
        const command = input.trim().toLowerCase();
        if (command === 'pause') {
            page.evaluate(() => window.setPauseState(true));
        } else if (command === 'resume') {
            page.evaluate(() => window.setPauseState(false));
        } else if (command === 'exit') {
            console.log("Shutting down the bot...");
            rl.close();
            await browser.close();
            process.exit(0);
        } else if (command !== '') {
            console.log("Unknown command. Available commands: pause, resume, exit");
        }
    });
})();