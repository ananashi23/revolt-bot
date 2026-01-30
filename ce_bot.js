// ce_bot.js - CE Server Only Version (Sends /claim 3x) - [FIXED]
import { chromium } from 'playwright';
import readline from 'readline';

// --- Configuration ---
const CE_SERVER_ID = "01JDKH82R0RHG2VF9YDWKEFHC5";
const CE_SERVER_NAME = "CE";

console.log("--- Starting Revolt Bot (CE Server Only Version) ---");

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
    console.log("🧠 Injecting the bot logic for CE server...");
    await context.addInitScript(() => {
        console.log('[Bot Script] Logic injected. Initializing queue and de-duplicator...');
        
        // --- DE-DUPLICATION SYSTEM ---
        window.processedChannelIds = new Set();
        window.channelQueue = [];
        let isProcessing = false;
        let isPaused = false;

        // Function to pause/resume the bot
        window.setPauseState = (paused) => {
            isPaused = paused;
            console.log(`[Bot Script] ${paused ? '⏸️ Bot PAUSED' : '▶️ Bot RESUMED'}`);
            
            if (paused) {
                window.channelQueue = [];
                console.log('[Bot Script] Queue cleared.');
            } else if (window.channelQueue.length > 0 && !isProcessing) {
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
            
            console.log(`[Bot Script] 🎯 Channel: ${channelName}, Server: ${window.ceServerName} (${serverId})`);

            const apiChannelUrl = `https://revolt-api.onech.at/channels/${channelId}/messages`;
            
            try {
                // Send /claim 3 times without delays
                for (let i = 1; i <= 3; i++) {
                    const payload = { content: '/claim', nonce: window.generateNonce(), replies: [] };
                    console.log(`[Bot Script] 🚀 Sending via Fetch (${i}/3): ${JSON.stringify(payload)}`);
                    
                    const response = await fetch(apiChannelUrl, {
                        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-session-token': window.authToken },
                        body: JSON.stringify(payload)
                    });
                    
                    console.log(`[Bot Script] 📡 API Response (${i}/3) Status: ${response.status} ${response.statusText}`);
                    if (!response.ok) {
                        const errorText = await response.text();
                        console.log(`[Bot Script] ❌ API Error Response (${i}/3): ${errorText}`);
                    } else {
                        const responseData = await response.json();
                        if (responseData._id) {
                            console.log(`[Bot Script] ✅ Message ${i}/3 sent successfully with ID: ${responseData._id}`);
                        } else {
                            console.log(`[Bot Script] ⚠️ Message ${i}/3 appeared to send but no message ID was returned`);
                        }
                    }
                }
                
                console.log(`[Bot Script] ✅ Successfully sent all messages to ${window.ceServerName}.`);

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
                                // *** THE FIX IS HERE ***
                                // It now correctly checks against the `window.ceServerId` variable that is set later.
                                if (data.type === "ChannelCreate" && data.server === window.ceServerId) {
                                    if (window.processedChannelIds.has(data._id)) {
                                        console.log(`[Bot Script] Duplicate event for channel ${data._id}. Ignoring.`);
                                        return;
                                    }

                                    if (isPaused) {
                                        console.log(`[Bot Script] Bot is paused - ignoring new channel in ${window.ceServerName}`);
                                        return;
                                    }

                                    window.processedChannelIds.add(data._id);
                                    console.log(`[Bot Script] New event detected in ${window.ceServerName}! Adding to queue...`);
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
    await page.goto('https://revolt.onech.at');
    
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
    console.log("🔐 Arming the bot with token and server ID...");
    await page.evaluate(({ token, ceServerId, ceServerName }) => {
        window.authToken = token;
        window.ceServerId = ceServerId; // This variable is now correctly used by the listener
        window.ceServerName = ceServerName;
        window.generateNonce = () => Date.now().toString(36) + Math.random().toString(36).substring(2);
        console.log(`[Bot Script] Bot is ARMED and ready. Listener is active for ${ceServerName} (${ceServerId}).`);
    }, { token: authToken, ceServerId: CE_SERVER_ID, ceServerName: CE_SERVER_NAME });

    console.log("🚀 Bot is now running for the CE server only. Good luck!");
    
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