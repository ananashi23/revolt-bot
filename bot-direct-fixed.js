// bot-optimized-browser-fixed.js - Fixed Browser Navigation Issue
import { chromium } from 'playwright';
import readline from 'readline';

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
    refillRate: 20,       // Increased to 20 tokens per second for faster response
    bucketSize: 30,       // Allow bursts of up to 30 messages
    tokenCost: 1,         // 1 token per message
    maxQueueSize: 200     // Increased queue size
};

// Server-Specific Delay Configuration (in ms)
const SERVER_DELAYS = {
    "VIP": { min: 50, max: 100 },      // Reduced delays for faster response
    "goonery": { min: 30, max: 50 }    // Reduced delays
    // Other servers have no delay (0ms)
};

// Memory Cleanup Configuration
const CLEANUP_CONFIG = {
    expirationTime: 24 * 60 * 60 * 1000,  // 24 hours in ms
    cleanupInterval: 60 * 60 * 1000,      // 1 hour in ms
    maxEntries: 100000                     // Maximum entries to track
};

console.log("--- Starting Optimized Browser Revolt Bot ---");
console.log(`Using API Base URL: ${API_BASE_URL}`);
console.log(`Rate Limit: ${RATE_LIMIT_CONFIG.refillRate} msg/sec with burst of ${RATE_LIMIT_CONFIG.bucketSize}`);
console.log(`Server Delays: VIP: ${SERVER_DELAYS.VIP.min}-${SERVER_DELAYS.VIP.max}ms, goonery: ${SERVER_DELAYS.goonery.min}-${SERVER_DELAYS.goonery.max}ms`);

// Helper function to generate a unique nonce
function generateNonce() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

(async () => {
    const browser = await chromium.launch({ 
        headless: true,  // Run in headless mode for better performance
        args: [
            '--disable-blink-Features=AutomationControlled',
            '--disable-service-workers',
            '--no-sandbox',
            '--disable-dev-shm-usage'
        ]
    });

    const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },  // Smaller viewport for better performance
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

    // --- Part 1: Navigate to login page ---
    await page.goto('https://workers.onech.at');
    
    console.log("Please log in to your account now.");
    console.log("Once you are successfully logged in and can see the app, press ENTER in this terminal to ACTIVATE the bot.");
    
    await new Promise(resolve => {
        process.stdin.once('data', () => {
            resolve();
        });
    });
    
    // Wait for navigation to complete after login
    console.log("⏳ Waiting for page to fully load after login...");
    await page.waitForLoadState('networkidle');
    
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

    // --- Part 2: "Arm" the bot with optimized systems ---
    console.log("🔐 Arming the bot with optimized systems...");
    
    // Inject the bot logic AFTER the page has fully loaded
    await page.addInitScript(() => {
        // Helper function to get current local time as a formatted string
        window.getLocalTime = () => {
            const now = new Date();
            return now.toLocaleString();
        };
        
        console.log('[Bot Script] Optimized logic injected. Initializing systems...');
        
        let isPaused = false;

        // Function to pause/resume the bot
        window.setPauseState = (paused) => {
            isPaused = paused;
            console.log(`[Bot Script] ${paused ? '⏸️ Bot PAUSED' : '▶️ Bot RESUMED'}`);
        };

        // Rate Limiter Class using Token Bucket Algorithm
        window.RateLimiter = class {
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
                        await new Promise(resolve => setTimeout(resolve, 10)); // Reduced wait time
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
        };

        // Channel Tracker Class with Memory Management
        window.ChannelTracker = class {
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
                
                if (removedCount > 0) {
                    console.log(`[ChannelTracker] Cleanup: removed ${removedCount} entries, ${this.processedChannels.size} remaining`);
                }
                
                if (this.processedChannels.size > this.config.maxEntries) {
                    const entries = Array.from(this.processedChannels.entries());
                    entries.sort((a, b) => a[1] - b[1]);
                    
                    const toRemove = entries.slice(0, this.processedChannels.size - this.config.maxEntries);
                    toRemove.forEach(([channelId]) => this.processedChannels.delete(channelId));
                    
                    console.log(`[ChannelTracker] Size limit: removed ${toRemove.length} oldest entries`);
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
        };

        // Initialize rate limiter and channel tracker
        window.rateLimiter = new window.RateLimiter(window.rateLimitConfig);
        window.channelTracker = new window.ChannelTracker(window.cleanupConfig);
        
        // This function now handles a single channel directly with rate limiting and server delays
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
                isPriority = (serverName === "VIP" || serverName === "goonery" || serverName === "Exclusive Orders"); // Priority for VIP, goonery, and Exclusive Orders
                
                // Apply server-specific delays
                if (serverName === "VIP" && window.serverDelays.VIP) {
                    serverDelay = window.serverDelays.VIP.min + Math.random() * (window.serverDelays.VIP.max - window.serverDelays.VIP.min);
                    console.log(`[Bot Script] ⏱️ VIP server detected, applying ${Math.round(serverDelay)}ms delay`);
                } else if (serverName === "goonery" && window.serverDelays.goonery) {
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
            
            // Create the task to be executed by rate limiter
            const sendMessageTask = async () => {
                try {
                    console.log(`[Bot Script] 🚀 Sending message via Fetch: ${messageContent}`);
                    
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

                    console.log(`[Bot Script] 📡 API Response: ${response.status} ${response.statusText}`);

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
        console.log('[Bot Script] Optimized WebSocket proxy and systems are in place.');
    });
    
    // Initialize rate limiter and channel tracker in the browser context
    await page.evaluate(({ 
        token, 
        targetServerIds, 
        serverNames, 
        apiBaseUrl, 
        rateLimitConfig, 
        cleanupConfig,
        serverDelays
    }) => {
        // Set global variables
        window.authToken = token;
        window.targetServerIds = targetServerIds;
        window.serverNames = serverNames;
        window.apiBaseUrl = apiBaseUrl;
        window.serverDelays = serverDelays;
        window.rateLimitConfig = rateLimitConfig;
        window.cleanupConfig = cleanupConfig;
        window.generateNonce = () => Date.now().toString(36) + Math.random().toString(36).substring(2);
        
        console.log('[Bot Script] Optimized bot is ARMED and ready.');
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
        
        // Log server monitoring
        console.log('[Bot Script] Monitoring servers:');
        for (const [serverId, serverName] of Object.entries(serverNames)) {
            console.log(`[Bot Script] - ${serverName} (${serverId})`);
        }
        
        console.log('[Bot Script] Special behavior:');
        console.log('[Bot Script] - VIP: Priority processing with ' + serverDelays.VIP.min + '-' + serverDelays.VIP.max + 'ms delay + random suffix only (..2-..5)');
        console.log('[Bot Script] - goonery: Priority processing with ' + serverDelays.goonery.min + '-' + serverDelays.goonery.max + 'ms delay + random suffix only (..2-..5)');
        console.log('[Bot Script] - Exclusive Orders: Priority processing with no delay + random suffix only (..2-..5)');
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

    console.log("🚀 Optimized bot is now running!");
    console.log("   - Rate Limited: 20 msg/sec sustained, 30 message bursts");
    console.log("   - Memory Managed: Automatic cleanup every hour");
    console.log("   - VIP: 50-100ms delay + priority processing + random suffix");
    console.log("   - goonery: 30-50ms delay + priority processing + random suffix");
    console.log("   - Exclusive Orders: No delay + priority processing + random suffix");
    console.log("   - Other servers: No delay, immediate processing");
    
    // Set up command line interface
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    // Add status command
    const showStatus = async () => {
        const status = await page.evaluate(() => {
            return {
                rateLimiter: window.rateLimiter.getStatus(),
                channelTracker: window.channelTracker.getStatus()
            };
        });
        
        console.log("\n--- Bot Status ---");
        console.log(`Rate Limiter: ${status.rateLimiter.tokens}/${RATE_LIMIT_CONFIG.bucketSize} tokens available`);
        console.log(`Queue: ${status.rateLimiter.queueLength} messages waiting`);
        console.log(`Channels Tracked: ${status.channelTracker.totalChannels}`);
        console.log("------------------\n");
    };

    rl.on('line', async (input) => {
        const command = input.trim().toLowerCase();
        if (command === 'pause') {
            page.evaluate(() => window.setPauseState(true));
        } else if (command === 'resume') {
            page.evaluate(() => window.setPauseState(false));
        } else if (command === 'status') {
            await showStatus();
        } else if (command === 'exit') {
            console.log("Shutting down the bot...");
            rl.close();
            await browser.close();
            process.exit(0);
        } else if (command !== '') {
            console.log("Available commands: pause, resume, status, exit");
        }
    });

    // Show initial status
    setTimeout(showStatus, 2000);
})();