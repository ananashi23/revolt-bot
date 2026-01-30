// bot.js - The "Foodcity Ticket Number" Version (Extracts and Sends Number Only)
import { chromium } from 'playwright';
import readline from 'readline';

// --- Configuration ---
// This is the correct API URL found via the Network tab.
const API_BASE_URL = "https://workers.api.onech.at"; 

const SERVER_NAMES = {
    "01K7A7CNSMC5XPTJ7J36H9XKGR": "Foodcity"
};

const TARGET_SERVER_IDS = Object.keys(SERVER_NAMES);

console.log("--- Starting Revolt Bot (The 'Foodcity Ticket Number' Version) ---");
console.log(`Using API Base URL: ${API_BASE_URL}`);

// Helper function to generate a unique nonce
function generateNonce() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
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
    console.log("🧠 Injecting the bot logic...");
    await context.addInitScript(() => {
        // Helper function to get current local time as a formatted string
        window.getLocalTime = () => {
            const now = new Date();
            return now.toLocaleString();
        };
        
        console.log('[Bot Script] Logic injected. Initializing queue and de-duplicator...');
        
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
            const channelName = data.name; // The ticket number is assumed to be the channel name
            const serverId = data.server;
            const serverName = window.serverNames[serverId] || "Unknown";
            
            console.log(`[Bot Script] 🎯 New ticket detected: ${channelName} in ${serverName}`);

            // --- CHANGE: Extract only the number from the channel name ---
            const ticketNumberMatch = channelName.match(/\d+/);
            const ticketNumber = ticketNumberMatch ? ticketNumberMatch[0] : channelName; // Fallback to full name if no number is found
            console.log(`[Bot Script] 🎫 Extracted Ticket Number: ${ticketNumber}`);

            const apiChannelUrl = `${window.apiBaseUrl}/channels/${channelId}/messages`;
            
            try {
                console.log(`[Bot Script] Preparing to send message to ${apiChannelUrl}`);
                // --- CHANGE: Use the extracted number as the content ---
                const payload = { content: ticketNumber, nonce: window.generateNonce(), replies: [] };
                console.log(`[Bot Script] 🚀 Sending ticket number via Fetch: ${JSON.stringify(payload)}`);
                
                const response = await fetch(apiChannelUrl, {
                    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-session-token': window.authToken },
                    body: JSON.stringify(payload)
                });

                console.log(`[Bot Script] 📡 API Response received. Status: ${response.status} ${response.statusText}`);

                if (!response.ok) {
                    const errorText = await response.text();
                    console.log(`[Bot Script] ❌ API Error Response: ${errorText}`);
                } else {
                    const responseData = await response.json();
                    if (responseData._id) {
                        console.log(`[Bot Script] ✅ Ticket number sent successfully with ID: ${responseData._id}`);
                    } else {
                        console.log(`[Bot Script] ⚠️ Ticket number appeared to send but no message ID was returned. Response: ${JSON.stringify(responseData)}`);
                    }
                }

            } catch (error) {
                console.error(`[Bot Script] ❌ A critical error occurred during fetch: ${error.message}`);
                console.error(error); // Log the full error object
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
                            try {
                                const data = JSON.parse(event.data);
                                if (data.type === "ChannelCreate" && window.targetServerIds.includes(data.server)) {
                                    if (window.processedChannelIds.has(data._id)) {
                                        console.log(`[Bot Script] Duplicate event for channel ${data._id}. Ignoring.`);
                                        return;
                                    }
                                    if (isPaused) {
                                        console.log(`[Bot Script] Bot is paused - ignoring new channel in ${window.serverNames[data.server] || "Unknown"}`);
                                        return;
                                    }
                                    window.processedChannelIds.add(data._id);
                                    const serverName = window.serverNames[data.server] || "Unknown";
                                    console.log(`[Bot Script] New ticket event detected in ${serverName}! Adding to queue...`);
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
    await page.evaluate(({ token, targetServerIds, serverNames, apiBaseUrl }) => {
        window.authToken = token;
        window.targetServerIds = targetServerIds;
        window.serverNames = serverNames;
        window.apiBaseUrl = apiBaseUrl; // Pass the correct variable to the browser
        window.generateNonce = () => Date.now().toString(36) + Math.random().toString(36).substring(2);
        console.log('[Bot Script] Bot is ARMED and ready. Listener is active.');
        console.log('[Bot Script] Monitoring server:');
        for (const [serverId, serverName] of Object.entries(serverNames)) {
            console.log(`[Bot Script] - ${serverName} (${serverId})`);
        }
    }, { token: authToken, targetServerIds: TARGET_SERVER_IDS, serverNames: SERVER_NAMES, apiBaseUrl: API_BASE_URL });

    console.log("🚀 Bot is now running for Foodcity. It will send the ticket number for new tickets.");
    
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