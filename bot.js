// bot.js - Final Version for Render Free Tier
// This version includes a dummy web server to satisfy Render's requirements.
import { chromium } from 'playwright';
import { createServer } from 'http'; // Import Node's built-in http module

// --- Configuration ---
const API_BASE_URL = "https://workers.api.onech.at"; 

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
const RATE_LIMIT_CONFIG = {
    refillRate: 8, bucketSize: 15, tokenCost: 1, maxQueueSize: 100
};

// Server-Specific Delay Configuration (in ms)
const SERVER_DELAYS = {
    "VIP": { min: 200, max: 200 },
    "goonery": { min: 180, max: 200 }
};

// Memory Cleanup Configuration
const CLEANUP_CONFIG = {
    expirationTime: 24 * 60 * 60 * 1000,
    cleanupInterval: 60 * 60 * 1000,
    maxEntries: 100000
};

// Helper function to generate a unique nonce
function generateNonce() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

// Rate Limiter Class
class RateLimiter {
    constructor(config) {
        this.config = config;
        this.tokens = config.bucketSize;
        this.lastRefill = Date.now();
        this.queue = [];
        this.processing = false;
    }
    async refillTokens() {
        const now = Date.now();
        const timePassed = (now - this.lastRefill) / 1000;
        const tokensToAdd = Math.floor(timePassed * this.config.refillRate);
        if (tokensToAdd > 0) {
            this.tokens = Math.min(this.config.bucketSize, this.tokens + tokensToAdd);
            this.lastRefill = now;
        }
    }
    async waitForToken() {
        await this.refillTokens();
        if (this.tokens >= this.config.tokenCost) {
            this.tokens -= this.config.tokenCost;
            return true;
        }
        return false;
    }
    async execute(task, priority = false) {
        return new Promise((resolve, reject) => {
            if (this.queue.length >= this.config.maxQueueSize) { reject(new Error('Rate limiter queue is full')); return; }
            const item = { task, resolve, reject, priority, timestamp: Date.now() };
            if (priority) {
                const firstNonPriority = this.queue.findIndex(item => !item.priority);
                if (firstNonPriority === -1) { this.queue.push(item); } else { this.queue.splice(firstNonPriority, 0, item); }
            } else { this.queue.push(item); }
            this.processQueue();
        });
    }
    async processQueue() {
        if (this.processing || this.queue.length === 0) return;
        this.processing = true;
        while (this.queue.length > 0) {
            const hasToken = await this.waitForToken();
            if (hasToken) {
                const item = this.queue.shift();
                try { const result = await item.task(); item.resolve(result); } catch (error) { item.reject(error); }
            } else { await new Promise(resolve => setTimeout(resolve, 50)); }
        }
        this.processing = false;
    }
}

// Channel Tracker Class
class ChannelTracker {
    constructor(config) {
        this.config = config;
        this.processedChannels = new Map();
        this.cleanupTimer = null;
        this.startCleanup();
    }
    add(channelId) {
        if (this.processedChannels.size >= this.config.maxEntries) {
            const oldestKey = this.processedChannels.keys().next().value;
            this.processedChannels.delete(oldestKey);
        }
        this.processedChannels.set(channelId, Date.now());
    }
    has(channelId) { return this.processedChannels.has(channelId); }
    cleanup() {
        const now = Date.now(); const cutoffTime = now - this.config.expirationTime; let removedCount = 0;
        for (const [channelId, timestamp] of this.processedChannels.entries()) {
            if (timestamp < cutoffTime) { this.processedChannels.delete(channelId); removedCount++; }
        }
        console.log(`[ChannelTracker] Cleanup: removed ${removedCount} entries, ${this.processedChannels.size} remaining`);
        if (this.processedChannels.size > this.config.maxEntries) {
            const entries = Array.from(this.processedChannels.entries()); entries.sort((a, b) => a[1] - b[1]);
            const toRemove = entries.slice(0, this.processedChannels.size - this.config.maxEntries);
            toRemove.forEach(([channelId]) => this.processedChannels.delete(channelId));
            console.log(`[ChannelTracker] Size limit: removed ${toRemove.length} oldest entries`);
        }
    }
    startCleanup() { this.cleanupTimer = setInterval(() => { this.cleanup(); }, this.config.cleanupInterval); }
    stopCleanup() { if (this.cleanupTimer) { clearInterval(this.cleanupTimer); this.cleanupTimer = null; } }
}

// --- Main Bot Logic ---
async function runBot() {
    console.log("🚀 Starting background bot logic...");
    const browser = await chromium.launch({ 
        headless: true,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        args: ['--disable-blink-Features=AutomationControlled', '--disable-service-workers', '--no-sandbox', '--disable-setuid-sandbox', '--lang=en-US,en;q=0.9', '--ignore-certificate-errors']
    });
    const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, locale: 'en-US' });
    const page = await context.newPage();
    page.on('console', msg => { if (msg.type() === 'log') { console.log(msg.text()); } });
    
    // Inject bot script
    await context.addInitScript(() => {
        window.serverNames = {"01K7A7CNSMC5XPTJ7J36H9XKGR":"Foodcity","01JY5290SHY9EV3CECD5CNEMHV":"Sams","01K7A7TBZ4SJKNXX47H9MHF6V7":"TGC","01JDPY161J6H6B1KBV74QWKCDM":"VIP","01KFC6QZDVV9H9V1GMR5XSST4G":"snackhack","01JDKAFHS1W2BTPSS9YDB6WNEP":"goonery","01JZ61Q8WN45VQ0ZMCM59T10ZX":"Exclusive Orders"};
        window.targetServerIds = Object.keys(window.serverNames);
        window.handleNewChannel = async (data) => {
            const channelId = data._id; const channelName = data.name; const serverId = data.server; const serverName = window.serverNames[serverId] || "Unknown";
            console.log(`[Bot Script] 🎯 New ticket detected: ${channelName} in ${serverName}`);
            const ticketNumberMatch = channelName.match(/\d+/); const ticketNumber = ticketNumberMatch ? ticketNumberMatch[0] : channelName;
            let messageContent = ticketNumber; let isPriority = false; let serverDelay = 0;
            if (serverName === "VIP" || serverName === "snackhack" || serverName === "goonery" || serverName === "Exclusive Orders") {
                const suffixes = ["..2", "..3", "..4", "..5"]; const randomSuffix = suffixes[Math.floor(Math.random() * suffixes.length)];
                messageContent = randomSuffix; isPriority = (serverName === "VIP" || serverName === "goonery");
                if (serverName === "VIP" && window.serverDelays.VIP) { serverDelay = window.serverDelays.VIP.min; }
                else if (serverName === "goonery" && window.serverDelays.goonery) { serverDelay = window.serverDelays.goonery.min + Math.random() * (window.serverDelays.goonery.max - window.serverDelays.goonery.min); }
                console.log(`[Bot Script] 🎲 ${serverName} server detected, sending suffix: ${randomSuffix}`);
            }
            if (serverDelay > 0) { await new Promise(resolve => setTimeout(resolve, serverDelay)); }
            const apiChannelUrl = `${window.apiBaseUrl}/channels/${channelId}/messages`;
            const sendMessageTask = async () => {
                const startTime = performance.now();
                try {
                    const response = await fetch(apiChannelUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-session-token': window.authToken }, body: JSON.stringify({ content: messageContent, nonce: window.generateNonce(), replies: [] }) });
                    const totalTime = performance.now() - startTime;
                    console.log(`[Bot Script] 📡 API Response: ${response.status} ${response.statusText} | ⏱️ Total time: ${totalTime.toFixed(2)}ms`);
                    if (!response.ok) { const errorText = await response.text(); console.log(`[Bot Script] ❌ API Error: ${errorText}`); throw new Error(`API Error: ${response.status}`); }
                    return await response.json();
                } catch (error) { console.error(`[Bot Script] ❌ Error sending message: ${error.message}`); throw error; }
            };
            try { await window.rateLimiter.execute(sendMessageTask, isPriority); } catch (error) { console.error(`[Bot Script] ❌ Rate limiter error: ${error.message}`); }
        };
        const OriginalWebSocket = window.WebSocket;
        Object.defineProperty(window, 'WebSocket', { get() { return new Proxy(OriginalWebSocket, { construct(target, args) { const ws = new target(...args); ws.addEventListener('message', (event) => { try { const data = JSON.parse(event.data); if (data.type === "ChannelCreate" && window.targetServerIds.includes(data.server)) { if (window.channelTracker.has(data._id)) { return; } window.channelTracker.add(data._id); const serverName = window.serverNames[data.server] || "Unknown"; console.log(`[Bot Script] New ticket in ${serverName}!`); window.handleNewChannel(data); } } catch (e) { console.error('[Bot Script] WS error:', e); } }); return ws; } }); }, set() { console.warn('[Bot Script] WS overwrite blocked.'); } });
        window.rateLimiter = { config: { refillRate: 8, bucketSize: 15, tokenCost: 1, maxQueueSize: 100 }, tokens: 15, lastRefill: Date.now(), queue: [], processing: false, async refillTokens() { const now = Date.now(); const timePassed = (now - this.lastRefill) / 1000; const tokensToAdd = Math.floor(timePassed * this.config.refillRate); if (tokensToAdd > 0) { this.tokens = Math.min(this.config.bucketSize, this.tokens + tokensToAdd); this.lastRefill = now; } }, async waitForToken() { await this.refillTokens(); if (this.tokens >= this.config.tokenCost) { this.tokens -= this.config.tokenCost; return true; } return false; }, async execute(task, priority = false) { return new Promise((resolve, reject) => { if (this.queue.length >= this.config.maxQueueSize) { reject(new Error('Queue full')); return; } const item = { task, resolve, reject, priority, timestamp: Date.now() }; if (priority) { const firstNonPriority = this.queue.findIndex(item => !item.priority); if (firstNonPriority === -1) { this.queue.push(item); } else { this.queue.splice(firstNonPriority, 0, item); } } else { this.queue.push(item); } this.processQueue(); }); }, async processQueue() { if (this.processing || this.queue.length === 0) return; this.processing = true; while (this.queue.length > 0) { const hasToken = await this.waitForToken(); if (hasToken) { const item = this.queue.shift(); try { const result = await item.task(); item.resolve(result); } catch (error) { item.reject(error); } } else { await new Promise(resolve => setTimeout(resolve, 50)); } } this.processing = false; } };
        window.channelTracker = { config: { expirationTime: 24 * 60 * 60 * 1000, cleanupInterval: 60 * 60 * 1000, maxEntries: 100000 }, processedChannels: new Map(), cleanupTimer: null, add(channelId) { if (this.processedChannels.size >= this.config.maxEntries) { const oldestKey = this.processedChannels.keys().next().value; this.processedChannels.delete(oldestKey); } this.processedChannels.set(channelId, Date.now()); }, has(channelId) { return this.processedChannels.has(channelId); }, cleanup() { const now = Date.now(); const cutoffTime = now - this.config.expirationTime; let removedCount = 0; for (const [channelId, timestamp] of this.processedChannels.entries()) { if (timestamp < cutoffTime) { this.processedChannels.delete(channelId); removedCount++; } } console.log(`[ChannelTracker] Cleanup: removed ${removedCount}`); }, startCleanup() { this.cleanupTimer = setInterval(() => { this.cleanup(); }, this.config.cleanupInterval); } };
        window.channelTracker.startCleanup();
        window.generateNonce = () => Date.now().toString(36) + Math.random().toString(36).substring(2);
        console.log('[Bot Script] Logic injected and ready.');
    });

    await page.goto('https://workers.onech.at');
    console.log("⏳ Waiting for the Revolt app to load... Use the public URL to log in!");
    try {
        await page.waitForSelector('main', { timeout: 60000 });
        console.log("✅ App is ready. Fetching token...");
    } catch (error) { console.error("❌ Timed out waiting for the app. Did you log in?"); await browser.close(); return; }

    const authToken = await page.evaluate(() => {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('localforage');
            request.onsuccess = () => {
                const db = request.result; const tx = db.transaction(['keyvaluepairs'], 'readonly'); const store = tx.objectStore('keyvaluepairs'); const getAllRequest = store.getAll();
                getAllRequest.onsuccess = () => {
                    const allValues = getAllRequest.result; let foundToken = null;
                    for (const value of allValues) {
                        if (value && value.sessions) { const sessionsObject = value.sessions; const userIdKey = Object.keys(sessionsObject)[0]; if (userIdKey && sessionsObject[userIdKey] && sessionsObject[userIdKey].session) { foundToken = sessionsObject[userIdKey].session.token; break; } }
                    }
                    if (foundToken) { resolve(foundToken); } else { reject(new Error('Token not found.')); }
                };
                getAllRequest.onerror = () => reject(getAllRequest.error);
            };
            request.onerror = () => reject(request.error);
        });
    });

    if (!authToken) { console.error("❌ Could not find token."); await browser.close(); return; }
    console.log("✅ Token fetched. Arming bot...");

    await page.evaluate(({ token, apiBaseUrl, serverDelays }) => {
        window.authToken = token; window.apiBaseUrl = apiBaseUrl; window.serverDelays = serverDelays;
        console.log('[Bot Script] Bot is ARMED and RUNNING!');
    }, { token: authToken, apiBaseUrl: API_BASE_URL, serverDelays: SERVER_DELAYS });
    console.log("🎉 Bot is now fully active and monitoring for tickets.");
}

// --- Start the Dummy Server and Run the Bot ---
const port = process.env.PORT || 3000;
const server = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
});

server.listen(port, () => {
    console.log(`🌐 Dummy server listening on port ${port} to satisfy Render.`);
    // Start the bot in the background without blocking the server
    runBot().catch(error => {
        console.error("🔥 Bot crashed:", error);
    });
});