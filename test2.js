// bot.js - The "Foodcity, Sams, TGC, VIP, Snackhack, Goonery & Exclusive Orders Ticket Number" Version (No Queue)
import { chromium } from 'playwright';
import readline from 'readline';

// --- Configuration ---
// This is the correct API URL found via the Network tab.
const API_BASE_URL = "https://workers.api.onech.at"; 

const SERVER_NAMES = {
    "01K7A7CNSMC5XPTJ7J36H9XKGR": "Foodcity",
    "01JY5290SHY9EV3CECD5CNEMHV": "Sams",
    "01K7A7TBZ4SJKNXX47H9MHF6V7": "TGC",
    "01JDPY161J6H6B1KBV74QWKCDM": "VIP",
    "01KFC6QZDVV9H9V1GMR5XSST4G": "snackhack",
    "01JDKAFHS1W2BTPSS9YDB6WNEP": "goonery",
    "01JZ61Q8WN45VQ0ZMCM59T10ZX": "Exclusive Orders"  // Added Exclusive Orders server
};

const TARGET_SERVER_IDS = Object.keys(SERVER_NAMES);

console.log("--- Starting Revolt Bot (The 'Foodcity, Sams, TGC, VIP, Snackhack, Goonery & Exclusive Orders Ticket Number' Version - No Queue) ---");
console.log(`Using API Base URL: ${API_BASE_URL}`);

// Helper function to generate a unique nonce
function generateNonce() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

(async () => {
    const browser = await chromium.launch({ 
        headless: false,
        args: [
            '--disable-blink-Features=AutomationControlled',
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
        
        console.log('[Bot Script] Logic injected. Initializing de-duplicator...');
        
        // --- DE-DUPLICATION SYSTEM ---
        window.processedChannelIds = new Set(); // Use a Set for fast lookups
        let isPaused = false;

        // Function to pause/resume the bot
        window.setPauseState = (paused) => {
            isPaused = paused;
            console.log(`[Bot Script] ${paused ? '⏸️ Bot PAUSED - ignoring new channels' : '▶️ Bot RESUMED - processing new channels'}`);
        };

        // This function now handles a single channel directly
        window.handleNewChannel = async (data) => {
            const channelId = data._id;
            const channelName = data.name; // The ticket number is assumed to be the channel name
            const serverId = data.server;
            const serverName = window.serverNames[serverId] || "Unknown";
            
            console.log(`[Bot Script] 🎯 New ticket detected: ${channelName} in ${serverName}`);

            // --- CHANGE: Extract only the number from the channel name ---
            const ticketNumberMatch = channelName.match(/\d+/);
            const ticketNumber = ticketNumberMatch ? ticketNumberMatch[0] : channelName; // Fallback to full name if no number is found
            console.log(`[Bot Script] 🎫 Extracted Ticket Number: ${ticketNumber}`);

            // --- NEW: Special handling for VIP, snackhack, goonery, and Exclusive Orders servers ---
            let messageContent = ticketNumber;
            
            if (serverName === "VIP" || serverName === "snackhack" || serverName === "goonery" || serverName === "Exclusive Orders") {
                // Randomly select a suffix from "..2", "..3", "..4", "..5"
                const suffixes = ["..2", "..3", "..4", "..5"];
                const randomSuffix = suffixes[Math.floor(Math.random() * suffixes.length)];
                messageContent = randomSuffix; // Only send the suffix, not the ticket number
                console.log(`[Bot Script] 🎲 ${serverName} server detected, sending suffix only: ${randomSuffix}`);
            }

            // Special delay for VIP server
            if (serverName === "VIP") {
                // Add a random delay between 200ms to 250ms for VIP server
                const delay = 200 + Math.random() * 50; // Random value between 200 and 250
                console.log(`[Bot Script] ⏱️ VIP server detected, adding ${Math.round(delay)}ms delay.`);
                
                await new Promise(resolve => setTimeout(resolve, delay));
            }
            
            // Special delay for goonery server
            if (serverName === "goonery") {
                // Add a random delay between 130ms to 170ms for goonery server
                const delay = 130 + Math.random() * 40; // Random value between 130 and 170
                console.log(`[Bot Script] ⏱️ goonery server detected, adding ${Math.round(delay)}ms delay.`);
                
                await new Promise(resolve => setTimeout(resolve, delay));
            }

            const apiChannelUrl = `${window.apiBaseUrl}/channels/${channelId}/messages`;
            
            try {
                console.log(`[Bot Script] Preparing to send message to ${apiChannelUrl}`);
                // --- CHANGE: Use the message content (modified for VIP, snackhack, goonery, and Exclusive Orders) ---
                const payload = { content: messageContent, nonce: window.generateNonce(), replies: [] };
                console.log(`[Bot Script] 🚀 Sending message via Fetch: ${JSON.stringify(payload)}`);
                
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
                        console.log(`[Bot Script] ✅ Message sent successfully with ID: ${responseData._id}`);
                    } else {
                        console.log(`[Bot Script] ⚠️ Message appeared to send but no message ID was returned. Response: ${JSON.stringify(responseData)}`);
                    }
                }

            } catch (error) {
                console.error(`[Bot Script] ❌ A critical error occurred during fetch for channel ${channelId}: ${error.message}`);
                console.error(error); // Log the full error object
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
                                    console.log(`[Bot Script] New ticket event detected in ${serverName}! Processing immediately...`);
                                    
                                    // --- CHANGE: Call the handler directly instead of using a queue ---
                                    window.handleNewChannel(data);
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
        console.log('[Bot Script] Monitoring servers:');
        for (const [serverId, serverName] of Object.entries(serverNames)) {
            console.log(`[Bot Script] - ${serverName} (${serverId})`);
        }
        console.log('[Bot Script] Special behavior:');
        console.log('[Bot Script] - VIP: Random suffix only (..2-..5) with 200-250ms delay');
        console.log('[Bot Script] - snackhack: Random suffix only (..2-..5) (no delay)');
        console.log('[Bot Script] - goonery: Random suffix only (..2-..5) with 130-170ms delay');
        console.log('[Bot Script] - Exclusive Orders: Random suffix only (..2-..5) (no delay)');
    }, { token: authToken, targetServerIds: TARGET_SERVER_IDS, serverNames: SERVER_NAMES, apiBaseUrl: API_BASE_URL });

    console.log("🚀 Bot is now running for Foodcity, Sams, TGC, VIP, snackhack, goonery and Exclusive Orders (No Queue).");
    console.log("   - Regular servers: Sends the ticket number immediately");
    console.log("   - VIP server: Sends only random suffix (..2-..5) after 200-250ms delay");
    console.log("   - snackhack server: Sends only random suffix (..2-..5) immediately");
    console.log("   - goonery server: Sends only random suffix (..2-..5) after 130-170ms delay");
    console.log("   - Exclusive Orders server: Sends only random suffix (..2-..5) immediately");
    
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