// bot.js - Enhanced Version with Rate Limiting, Memory Management, Server-Specific Delays, and Latency Measurement
// MODIFIED FOR SERVER DEPLOYMENT (e.g., Render)
import { chromium } from 'playwright';

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
    refillRate: 8,        // 8 tokens per second (1 token every 125ms)
    bucketSize: 15,       // Allow bursts of up to 15 messages
    tokenCost: 1,         // 1 token per message
    maxQueueSize: 100     // Maximum messages to queue
};

// Server-Specific Delay Configuration (in ms)
const SERVER_DELAYS = {
    "VIP": { min: 200, max: 200 },      // Fixed 200ms delay for VIP
    "goonery": { min: 180, max: 200 }   // 180-200ms delay for goonery
    // Other servers have no delay (0ms)
};

// Memory Cleanup Configuration
const CLEANUP_CONFIG = {
    expirationTime: 24 * 60 * 60 * 1000,  // 24 hours in ms
    cleanupInterval: 60 * 60 * 1000,      // 1 hour in ms
    maxEntries: 100000                     // Maximum entries to track
};

console.log("--- Starting Enhanced Revolt Bot (Server Deployed) ---");
console.log(`Using API Base URL: ${API_BASE_URL}`);
console.log(`Rate Limit: ${RATE_LIMIT_CONFIG.refillRate} msg/sec with burst of ${RATE_LIMIT_CONFIG.bucketSize}`);
console.log(`Server Delays: VIP: ${SERVER_DELAYS.VIP.min}ms (fixed), goonery: ${SERVER_DELAYS.goonery.min}-${SERVER_DELAYS.goonery.max}ms`);

// Helper function to generate a unique nonce
function generateNonce() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

// Rate Limiter Class using Token Bucket Algorithm
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
            if (this.queue.length >= this.config.maxQueueSize) {
                reject(new Error('Rate limiter queue is full'));
                return;
            }

            const item = { task, resolve, reject, priority, timestamp: Date.now() };
            
            if (priority) {
                const firstNonPriority = this.queue.findIndex(item => !item.priority);
                if (firstNonPriority === -1) {
                    this.queue.push(item);
                } else {
                    this.queue.splice(firstNonPriority, 0, item);
                }
            } else {
                this.queue.push(item);
            }

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
                try {
                    const result = await item.task();
                    item.resolve(result);
                } catch (error) {
                    item.reject(error);
                }
            } else {
                // Wait for tokens to refill
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }
        
        this.processing = false;
    }

    getStatus() {
        return {
            tokens: this.tokens,
            queueLength: this.queue.length,
            processing: this.processing
        };
    }
}

// Channel Tracker Class with Memory Management
class ChannelTracker {
    constructor(config) {
        this.config = config;
        this.processedChannels = new Map(); // channelId -> timestamp
        this.cleanupTimer = null;
        this.startCleanup();
    }

    add(channelId) {
        // Remove oldest entries if we hit the limit
        if (this.processedChannels.size >= this.config.maxEntries) {
            const oldestKey = this.processedChannels.keys().next().value;
            this.processedChannels.delete(oldestKey);
        }
        
        this.processedChannels.set(channelId, Date.now());
    }

    has(channelId) {
        return this.processedChannels.has(channelId);
    }

    cleanup() {
        const now = Date.now();
        const cutoffTime = now - this.config.expirationTime;
        let removedCount = 0;
        
        for (const [channelId, timestamp] of this.processedChannels.entries()) {
            if (timestamp < cutoffTime) {
                this.processedChannels.delete(channelId);
                removedCount++;
            }
        }
        
        console.log(`[ChannelTracker] Cleanup completed: removed ${removedCount} expired entries, ${this.processedChannels.size} remaining`);
        
        // Also enforce size limit
        if (this.processedChannels.size > this.config.maxEntries) {
            const entries = Array.from(this.processedChannels.entries());
            entries.sort((a, b) => a[1] - b[1]); // Sort by timestamp (oldest first)
            
            const toRemove = entries.slice(0, this.processedChannels.size - this.config.maxEntries);
            toRemove.forEach(([channelId]) => this.processedChannels.delete(channelId));
            
            console.log(`[ChannelTracker] Size limit enforced: removed ${toRemove.length} oldest entries`);
        }
    }

    startCleanup() {
        this.cleanupTimer = setInterval(() => {
            this.cleanup();
        }, this.config.cleanupInterval);
    }

    stopCleanup() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
    }

    getStatus() {
        return {
            totalChannels: this.processedChannels.size,
            oldestEntry: this.processedChannels.size > 0 ? 
                Math.min(...Array.from(this.processedChannels.values())) : null
        };
    }
}

(async () => {
    console.log("🔧 DIAGNOSTIC: About to launch browser...");
    try {
// MODIFICATION: Launch browser with a realistic user-agent to bypass bot detection
const browser = await Promise.race([
    chromium.launch({ 
        headless: true,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        args: [
            '--disable-blink-Features=AutomationControlled',
            '--disable-service-workers',
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--lang=en-US,en;q=0.9',
            '--ignore-certificate-errors'
        ]
    }),
    new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Browser launch timed out after 30 seconds')), 30000)
    )
]);
        console.log("✅ DIAGNOSTIC: Browser launched successfully.");

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
        console.log("🧠 Injecting the enhanced bot logic with server delays and latency measurement...");
        await context.addInitScript(() => {
            // Helper function to get current local time as a formatted string
            window.getLocalTime = () => {
                const now = new Date();
                return now.toLocaleString();
            };
            
            console.log('[Bot Script] Enhanced logic injected with server delays and latency measurement. Initializing systems...');
            
            let isPaused = false;

            // Function to pause/resume the bot
            window.setPauseState = (paused) => {
                isPaused = paused;
                console.log(`[Bot Script] ${paused ? '⏸️ Bot PAUSED' : '▶️ Bot RESUMED'}`);
            };

            // This function now handles a single channel directly with rate limiting, server delays, and latency measurement
            window.handleNewChannel = async (data) => {
                const channelId = data._id;
                const channelName = data.name;
                const serverId = data.server;
                const serverName = window.serverNames[serverId] || "Unknown";
                
                console.log(`[Bot Script] 🎯 New ticket detected: ${channelName} in ${serverName}`);

                // Extract only the number from the channel name
                const ticketNumberMatch = channelName.match(/\d+/);
                const ticketNumber = ticketNumberMatch ? ticketNumberMatch[0] : channelName;
                console.log(`[Bot Script] 🎫 Extracted Ticket Number: ${ticketNumber}`);

                // Determine message content and priority
                let messageContent = ticketNumber;
                let isPriority = false;
                let serverDelay = 0;
                
                if (serverName === "VIP" || serverName === "snackhack" || serverName === "goonery" || serverName === "Exclusive Orders") {
                    const suffixes = ["..2", "..3", "..4", "..5"];
                    const randomSuffix = suffixes[Math.floor(Math.random() * suffixes.length)];
                    messageContent = randomSuffix;
                    isPriority = (serverName === "VIP" || serverName === "goonery"); // Priority for VIP and goonery
                    
                    // Apply server-specific delays for VIP and goonery
                    if (serverName === "VIP" && window.serverDelays.VIP) {
                        // Fixed delay for VIP (min and max are the same)
                        serverDelay = window.serverDelays.VIP.min;
                        console.log(`[Bot Script] ⏱️ VIP server detected, applying ${serverDelay}ms delay`);
                    } else if (serverName === "goonery" && window.serverDelays.goonery) {
                        // Random delay range for goonery
                        serverDelay = window.serverDelays.goonery.min + Math.random() * (window.serverDelays.goonery.max - window.serverDelays.goonery.min);
                        console.log(`[Bot Script] ⏱️ goonery server detected, applying ${Math.round(serverDelay)}ms delay`);
                    }
                    
                    console.log(`[Bot Script] 🎲 ${serverName} server detected, sending suffix only: ${randomSuffix} (Priority: ${isPriority})`);
                }

                // Apply server-specific delay before proceeding
                if (serverDelay > 0) {
                    await new Promise(resolve => setTimeout(resolve, serverDelay));
                }

                const apiChannelUrl = `${window.apiBaseUrl}/channels/${channelId}/messages`;
                
                // Create the task to be executed by rate limiter with latency measurement
                const sendMessageTask = async () => {
                    const startTime = performance.now();
                    const sendStartTime = Date.now();
                    
                    try {
                        console.log(`[Bot Script] 🚀 Sending message via Fetch: ${messageContent}`);
                        
                        const fetchStartTime = performance.now();
                        const response = await fetch(apiChannelUrl, {
                            method: 'POST', 
                            headers: { 
                                'Content-Type': 'application/json', 
                                'x-session-token': window.authToken 
                            },
                            body: JSON.stringify({ 
                                content: messageContent, 
                                nonce: window.generateNonce(), 
                                replies: [] 
                            })
                        });
                        const fetchEndTime = performance.now();
                        const fetchTime = fetchEndTime - fetchStartTime;
                        
                        const networkTime = fetchTime; // This includes network + API processing
                        const totalTime = performance.now() - startTime;
                        
                        console.log(`[Bot Script] 📡 API Response: ${response.status} ${response.statusText}`);
                        console.log(`[Bot Script] ⏱️ Latency Metrics:`);
                        console.log(`[Bot Script]   - Total time: ${totalTime.toFixed(2)}ms`);
                        console.log(`[Bot Script]   - Network + API time: ${networkTime.toFixed(2)}ms`);
                        console.log(`[Bot Script]   - Processing time: ${(totalTime - networkTime).toFixed(2)}ms`);

                        // Update latency statistics
                        window.latencyTracker.addMeasurement(networkTime, totalTime, serverName);

                        if (!response.ok) {
                            const errorText = await response.text();
                            console.log(`[Bot Script] ❌ API Error: ${errorText}`);
                            throw new Error(`API Error: ${response.status} - ${errorText}`);
                        } else {
                            const responseData = await response.json();
                            if (responseData._id) {
                                console.log(`[Bot Script] ✅ Message sent successfully with ID: ${responseData._id}`);
                            } else {
                                console.log(`[Bot Script] ⚠️ Message sent but no ID returned`);
                            }
                            return responseData;
                        }

                    } catch (error) {
                        console.error(`[Bot Script] ❌ Error sending message: ${error.message}`);
                        throw error;
                    }
                };

                // Execute through rate limiter with priority if needed
                try {
                    await window.rateLimiter.execute(sendMessageTask, isPriority);
                } catch (error) {
                    console.error(`[Bot Script] ❌ Rate limiter error: ${error.message}`);
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
                                        if (window.channelTracker.has(data._id)) {
                                            console.log(`[Bot Script] Duplicate event for channel ${data._id}. Ignoring.`);
                                            return;
                                        }
                                        if (isPaused) {
                                            console.log(`[Bot Script] Bot is paused - ignoring new channel in ${window.serverNames[data.server] || "Unknown"}`);
                                            return;
                                        }
                                        window.channelTracker.add(data._id);
                                        const serverName = window.serverNames[data.server] || "Unknown";
                                        console.log(`[Bot Script] New ticket event detected in ${serverName}! Processing...`);
                                        
                                        window.handleNewChannel(data);
                                    }
                                } catch (e) { 
                                    console.error('[Bot Script] WebSocket message parsing error:', e);
                                }
                            });
                            return ws;
                        }
                    });
                },
                set() {
                    console.warn('[Bot Script] Attempt to overwrite window.WebSocket was blocked.');
                }
            });
            console.log('[Bot Script] Enhanced WebSocket proxy and systems are in place.');
        });
        
        // --- Part 1: Log in and fetch token ---
        await page.goto('https://workers.onech.at');
        
        // DIAGNOSTIC: Log the page title and URL to see what we landed on
        console.log("🔍 DIAGNOSTIC: Checking page state...");
        const pageTitle = await page.title();
        const pageUrl = page.url();
        console.log(`🔍 DIAGNOSTIC: Page Title: "${pageTitle}"`);
        console.log(`🔍 DIAGNOSTIC: Page URL: "${pageUrl}"`);
        
        // MODIFICATION: Wait for the main app to load before fetching the token
        console.log("⏳ Waiting for the Revolt app to load...");
        console.log("   -> Use the public URL of this service to log in now!");
        console.log("   -> The bot will automatically proceed once the app is ready.");
        try {
            // Wait for a main element that only appears after a successful login
            await page.waitForSelector('main', { timeout: 60000 }); // Wait up to 60 seconds
            console.log("✅ App is ready. Proceeding with token fetch from IndexedDB...");
        } catch (error) {
            console.error("❌ Timed out waiting for the Revolt app to load. Did you log in?");
            // Exit the process if the app never loads
            process.exit(1);
        }

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

        // --- Part 2: "Arm" the bot with enhanced systems ---
        console.log("🔐 Arming the bot with enhanced systems, server delays, and latency measurement...");
        
        // Initialize rate limiter, channel tracker, and latency tracker in the browser context
        await page.evaluate(({ 
            token, 
            targetServerIds, 
            serverNames, 
            apiBaseUrl, 
            rateLimitConfig, 
            cleanupConfig,
            serverDelays
        }) => {
            // Initialize Rate Limiter
            window.rateLimiter = {
                config: rateLimitConfig,
                tokens: rateLimitConfig.bucketSize,
                lastRefill: Date.now(),
                queue: [],
                processing: false,
                
                async refillTokens() {
                    const now = Date.now();
                    const timePassed = (now - this.lastRefill) / 1000;
                    const tokensToAdd = Math.floor(timePassed * this.config.refillRate);
                    
                    if (tokensToAdd > 0) {
                        this.tokens = Math.min(this.config.bucketSize, this.tokens + tokensToAdd);
                        this.lastRefill = now;
                    }
                },
                
                async waitForToken() {
                    await this.refillTokens();
                    
                    if (this.tokens >= this.config.tokenCost) {
                        this.tokens -= this.config.tokenCost;
                        return true;
                    }
                    
                    return false;
                },
                
                async execute(task, priority = false) {
                    return new Promise((resolve, reject) => {
                        if (this.queue.length >= this.config.maxQueueSize) {
                            reject(new Error('Rate limiter queue is full'));
                            return;
                        }

                        const item = { task, resolve, reject, priority, timestamp: Date.now() };
                        
                        if (priority) {
                            const firstNonPriority = this.queue.findIndex(item => !item.priority);
                            if (firstNonPriority === -1) {
                                this.queue.push(item);
                            } else {
                                this.queue.splice(firstNonPriority, 0, item);
                            }
                        } else {
                            this.queue.push(item);
                        }

                        this.processQueue();
                    });
                },
                
                async processQueue() {
                    if (this.processing || this.queue.length === 0) return;
                    
                    this.processing = true;

                    while (this.queue.length > 0) {
                        const hasToken = await this.waitForToken();
                        
                        if (hasToken) {
                            const item = this.queue.shift();
                            try {
                                const result = await item.task();
                                item.resolve(result);
                            } catch (error) {
                                item.reject(error);
                            }
                        } else {
                            await new Promise(resolve => setTimeout(resolve, 50));
                        }
                    }
                    
                    this.processing = false;
                },
                
                getStatus() {
                    return {
                        tokens: this.tokens,
                        queueLength: this.queue.length,
                        processing: this.processing
                    };
                }
            };

            // Initialize Channel Tracker
            window.channelTracker = {
                config: cleanupConfig,
                processedChannels: new Map(),
                cleanupTimer: null,
                
                add(channelId) {
                    if (this.processedChannels.size >= this.config.maxEntries) {
                        const oldestKey = this.processedChannels.keys().next().value;
                        this.processedChannels.delete(oldestKey);
                    }
                    
                    this.processedChannels.set(channelId, Date.now());
                },
                
                has(channelId) {
                    return this.processedChannels.has(channelId);
                },
                
                cleanup() {
                    const now = Date.now();
                    const cutoffTime = now - this.config.expirationTime;
                    let removedCount = 0;
                    
                    for (const [channelId, timestamp] of this.processedChannels.entries()) {
                        if (timestamp < cutoffTime) {
                            this.processedChannels.delete(channelId);
                            removedCount++;
                        }
                    }
                    
                    console.log(`[ChannelTracker] Cleanup: removed ${removedCount} entries, ${this.processedChannels.size} remaining`);
                    
                    if (this.processedChannels.size > this.config.maxEntries) {
                        const entries = Array.from(this.processedChannels.entries());
                        entries.sort((a, b) => a[1] - b[1]);
                        
                        const toRemove = entries.slice(0, this.processedChannels.size - this.config.maxEntries);
                        toRemove.forEach(([channelId]) => this.processedChannels.delete(channelId));
                        
                        console.log(`[ChannelTracker] Size limit: removed ${toRemove.length} oldest entries`);
                    }
                },
                
                startCleanup() {
                    this.cleanupTimer = setInterval(() => {
                        this.cleanup();
                    }, this.config.cleanupInterval);
                },
                
                getStatus() {
                    return {
                        totalChannels: this.processedChannels.size,
                        oldestEntry: this.processedChannels.size > 0 ? 
                            Math.min(...Array.from(this.processedChannels.values())) : null
                    };
                }
            };

            // Initialize Latency Tracker
            window.latencyTracker = {
                measurements: [],
                maxMeasurements: 1000, // Keep last 1000 measurements
                
                addMeasurement(networkTime, totalTime, serverName) {
                    this.measurements.push({
                        networkTime,
                        totalTime,
                        processingTime: totalTime - networkTime,
                        serverName,
                        timestamp: Date.now()
                    });
                    
                    // Keep only the most recent measurements
                    if (this.measurements.length > this.maxMeasurements) {
                        this.measurements = this.measurements.slice(-this.maxMeasurements);
                    }
                },
                
                getStats() {
                    if (this.measurements.length === 0) {
                        return {
                            count: 0,
                            avgNetworkTime: 0,
                            minNetworkTime: 0,
                            maxNetworkTime: 0,
                            avgTotalTime: 0,
                            minTotalTime: 0,
                            maxTotalTime: 0,
                            avgProcessingTime: 0
                        };
                    }
                    
                    const networkTimes = this.measurements.map(m => m.networkTime);
                    const totalTimes = this.measurements.map(m => m.totalTime);
                    const processingTimes = this.measurements.map(m => m.processingTime);
                    
                    return {
                        count: this.measurements.length,
                        avgNetworkTime: networkTimes.reduce((a, b) => a + b, 0) / networkTimes.length,
                        minNetworkTime: Math.min(...networkTimes),
                        maxNetworkTime: Math.max(...networkTimes),
                        avgTotalTime: totalTimes.reduce((a, b) => a + b, 0) / totalTimes.length,
                        minTotalTime: Math.min(...totalTimes),
                        maxTotalTime: Math.max(...totalTimes),
                        avgProcessingTime: processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length
                    };
                },
                
                getServerStats(serverName) {
                    const serverMeasurements = this.measurements.filter(m => m.serverName === serverName);
                    
                    if (serverMeasurements.length === 0) {
                        return {
                            count: 0,
                            avgNetworkTime: 0,
                            minNetworkTime: 0,
                            maxNetworkTime: 0,
                            avgTotalTime: 0,
                            minTotalTime: 0,
                            maxTotalTime: 0,
                            avgProcessingTime: 0
                        };
                    }
                    
                    const networkTimes = serverMeasurements.map(m => m.networkTime);
                    const totalTimes = serverMeasurements.map(m => m.totalTime);
                    const processingTimes = serverMeasurements.map(m => m.processingTime);
                    
                    return {
                        count: serverMeasurements.length,
                        avgNetworkTime: networkTimes.reduce((a, b) => a + b, 0) / networkTimes.length,
                        minNetworkTime: Math.min(...networkTimes),
                        maxNetworkTime: Math.max(...networkTimes),
                        avgTotalTime: totalTimes.reduce((a, b) => a + b, 0) / totalTimes.length,
                        minTotalTime: Math.min(...totalTimes),
                        maxTotalTime: Math.max(...totalTimes),
                        avgProcessingTime: processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length
                    };
                },
                
                reset() {
                    this.measurements = [];
                    console.log('[LatencyTracker] Statistics reset');
                }
            };

            // Start cleanup timer
            window.channelTracker.startCleanup();
            
            // Set global variables
            window.authToken = token;
            window.targetServerIds = targetServerIds;
            window.serverNames = serverNames;
            window.apiBaseUrl = apiBaseUrl;
            window.serverDelays = serverDelays; // Add server delays configuration
            window.generateNonce = () => Date.now().toString(36) + Math.random().toString(36).substring(2);
            
            console.log('[Bot Script] Enhanced bot is ARMED and ready.');
            console.log('[Bot Script] Rate Limiting:', rateLimitConfig.refillRate + ' msg/sec with burst of ' + rateLimitConfig.bucketSize);
            console.log('[Bot Script] Server Delays:');
            for (const [server, delay] of Object.entries(serverDelays)) {
                if (delay.min === delay.max) {
                    console.log(`[Bot Script] - ${server}: ${delay.min}ms (fixed)`);
                } else {
                    console.log(`[Bot Script] - ${server}: ${delay.min}-${delay.max}ms (range)`);
                }
            }
            console.log('[Bot Script] Memory Cleanup: every ' + (cleanupConfig.cleanupInterval/60000) + ' minutes, keeping ' + (cleanupConfig.expirationTime/3600000) + 'h of data');
            console.log('[Bot Script] Latency Measurement: Enabled');
            
            // Log server monitoring
            console.log('[Bot Script] Monitoring servers:');
            for (const [serverId, serverName] of Object.entries(serverNames)) {
                console.log(`[Bot Script] - ${serverName} (${serverId})`);
            }
            
            console.log('[Bot Script] Special behavior:');
            console.log('[Bot Script] - VIP: Priority processing with ' + serverDelays.VIP.min + 'ms fixed delay + random suffix only (..2-..5)');
            console.log('[Bot Script] - goonery: Priority processing with ' + serverDelays.goonery.min + '-' + serverDelays.goonery.max + 'ms delay + random suffix only (..2-..5)');
            console.log('[Bot Script] - snackhack/Exclusive Orders: Random suffix only (..2-..5) with no delay');
            console.log('[Bot Script] - Others: Ticket number with no delay');
            
        }, { 
            token: authToken, 
            targetServerIds: TARGET_SERVER_IDS, 
            serverNames: SERVER_NAMES, 
            apiBaseUrl: API_BASE_URL,
            rateLimitConfig: RATE_LIMIT_CONFIG,
            cleanupConfig: CLEANUP_CONFIG,
            serverDelays: SERVER_DELAYS
        });

        console.log("🚀 Enhanced bot is now running with server-specific delays and latency measurement!");
        console.log("   - Rate Limited: 8 msg/sec sustained, 15 message bursts");
        console.log("   - Memory Managed: Automatic cleanup every hour");
        console.log("   - VIP: 200ms fixed delay + priority processing + random suffix");
        console.log("   - goonery: 180-200ms delay + priority processing + random suffix");
        console.log("   - Other servers: No delay, immediate processing");
        console.log("   - Latency Measurement: Tracking network and API response times");

    } catch (error) {
        console.error("🔧 DIAGNOSTIC: An error occurred during startup:", error);
        process.exit(1);
    }
})();