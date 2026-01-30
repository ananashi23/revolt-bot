// bot.js - FINAL AUTOMATED VERSION FOR RENDER
// This version connects directly to the WebSocket API using a token.
import { chromium } from 'playwright';
import { createServer } from 'http';
import { WebSocket } from 'ws'; // We need the 'ws' library for direct WebSocket connection

// --- Configuration ---
const API_BASE_URL = "https://workers.api.onech.at";
const WEBSOCKET_URL = "wss://ws.revolt.chat/"; // Revolt's WebSocket Gateway

const SERVER_NAMES = {
    "01K7A7CNSMC5XPTJ7J36H9XKGR": "Foodcity",
    "01JY5290SHY9EV3CECD5CNEMHV": "Sams",
    "01K7A7TBZ4SJKNXX47H9MHF6V7": "TGC",
    "01JDPY161J6H6B1KBV74QWKCDM": "VIP",
    "01KFC6QZDVV9H9V1GMR5XSST4G": "snackhack",
    "01JDKAFHS1W2BTPSS9YDB6WNEP": "goonery",
    "01JZ61Q8WN45VQ0ZMCM59T10ZX": "Exclusive Orders"
};
const TARGET_SERVER_IDS = Object.keys(SERVER_NAMES);

// Rate Limiting Configuration
const RATE_LIMIT_CONFIG = { refillRate: 8, bucketSize: 15, tokenCost: 1, maxQueueSize: 100 };
// Server-Specific Delay Configuration (in ms)
const SERVER_DELAYS = { "VIP": { min: 200, max: 200 }, "goonery": { min: 180, max: 200 } };

// Helper function to generate a unique nonce
function generateNonce() { return Date.now().toString(36) + Math.random().toString(36).substring(2); }

// Rate Limiter Class (same as before)
class RateLimiter {
    constructor(config) { /* ... (same implementation as before) ... */ }
    async refillTokens() { /* ... */ }
    async waitForToken() { /* ... */ }
    async execute(task, priority = false) { /* ... */ }
    async processQueue() { /* ... */ }
    getStatus() { /* ... */ }
}

// --- Main Bot Logic ---
async function runBot() {
    const authToken = process.env.REVOLT_AUTH_COOKIE;
    if (!authToken) {
        console.error("❌ FATAL ERROR: REVOLT_AUTH_COOKIE environment variable not set.");
        return;
    }
    console.log("✅ Auth token found. Connecting to Revolt WebSocket Gateway...");

    const ws = new WebSocket(WEBSOCKET_URL, [], {
        headers: {
            'Authorization': authToken
        }
    });

    const rateLimiter = new RateLimiter(RATE_LIMIT_CONFIG);
    const processedChannels = new Set(); // Use a Set for faster lookups

    ws.on('open', () => {
        console.log("🎉 WebSocket connection established. Bot is now monitoring for tickets!");
        // Authenticate the session
        ws.send(JSON.stringify({ type: "Authenticate", token: authToken }));
    });

    ws.on('message', (data) => {
        try {
            const event = JSON.parse(data.toString());
            if (event.type === "Authenticated") {
                console.log("✅ Successfully authenticated with Revolt.");
            }
            if (event.type === "ChannelCreate" && TARGET_SERVER_IDS.includes(event.server)) {
                const channelId = event._id;
                if (processedChannels.has(channelId)) {
                    console.log(`[Bot] Duplicate event for channel ${channelId}. Ignoring.`);
                    return;
                }
                processedChannels.add(channelId);

                const channelName = event.name;
                const serverName = SERVER_NAMES[event.server] || "Unknown";
                console.log(`[Bot] 🎯 New ticket detected: ${channelName} in ${serverName}`);

                const ticketNumberMatch = channelName.match(/\d+/);
                const ticketNumber = ticketNumberMatch ? ticketNumberMatch[0] : channelName;

                let messageContent = ticketNumber;
                let isPriority = false;
                let serverDelay = 0;

                if (serverName === "VIP" || serverName === "snackhack" || serverName === "goonery" || serverName === "Exclusive Orders") {
                    const suffixes = ["..2", "..3", "..4", "..5"];
                    messageContent = suffixes[Math.floor(Math.random() * suffixes.length)];
                    isPriority = (serverName === "VIP" || serverName === "goonery");
                    if (serverName === "VIP") serverDelay = SERVER_DELAYS.VIP.min;
                    else if (serverName === "goonery") serverDelay = SERVER_DELAYS.goonery.min + Math.random() * (SERVER_DELAYS.goonery.max - SERVER_DELAYS.goonery.min);
                    console.log(`[Bot] 🎲 ${serverName} server detected, sending suffix: ${messageContent}`);
                }

                const sendMessageTask = async () => {
                    const startTime = performance.now();
                    try {
                        const response = await fetch(`${API_BASE_URL}/channels/${channelId}/messages`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'x-session-token': authToken },
                            body: JSON.stringify({ content: messageContent, nonce: generateNonce(), replies: [] })
                        });
                        const totalTime = performance.now() - startTime;
                        console.log(`[Bot] 📡 API Response: ${response.status} | ⏱️ Total time: ${totalTime.toFixed(2)}ms`);
                        if (!response.ok) {
                            const errorText = await response.text();
                            console.log(`[Bot] ❌ API Error: ${errorText}`);
                        }
                    } catch (error) {
                        console.error(`[Bot] ❌ Error sending message: ${error.message}`);
                    }
                };

                rateLimiter.execute(sendMessageTask, isPriority);
            }
        } catch (e) {
            console.error('[Bot] Error parsing WebSocket message:', e);
        }
    });

    ws.on('error', (error) => {
        console.error('🔥 WebSocket Error:', error);
    });

    ws.on('close', (code, reason) => {
        console.log(`🔌 WebSocket closed. Code: ${code}, Reason: ${reason.toString()}`);
        // Optional: Add logic to reconnect here if needed
    });
}


// --- Start the Dummy Server and Run the Bot ---
const port = process.env.PORT || 3000;
const server = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
});

server.listen(port, () => {
    console.log(`🌐 Dummy server listening on port ${port} to satisfy Render.`);
    runBot();
});