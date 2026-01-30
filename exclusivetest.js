// bot.js - Continuous Messaging Bot for Exclusive Orders
import { chromium } from 'playwright';
import readline from 'readline';

// --- Configuration ---
const API_BASE_URL = "https://workers.api.onech.at"; 
const EXCLUSIVE_ORDERS_SERVER_ID = "01JZ61Q8WN45VQ0ZMCM59T10ZX";
const MESSAGE_INTERVAL = 300; // 0.3 seconds in milliseconds

console.log("--- Continuous Messaging Bot for Exclusive Orders ---");
console.log(`Using API Base URL: ${API_BASE_URL}`);
console.log(`Focusing exclusively on server: ${EXCLUSIVE_ORDERS_SERVER_ID}`);
console.log(`Sending messages every ${MESSAGE_INTERVAL}ms`);

// Helper function to generate a unique nonce
function generateNonce() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
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

    // --- Part 0: Inject the continuous messaging bot logic ---
    console.log("🧠 Injecting continuous messaging bot logic...");
    await context.addInitScript(() => {
        console.log('[Bot Script] Continuous messaging logic injected. Initializing...');
        
        let isPaused = false;
        let allChannels = new Set(); // Track all channels in the server
        let messageInterval = null;
        let messageCount = 0;

        // Function to pause/resume the bot
        window.setPauseState = (paused) => {
            isPaused = paused;
            console.log(`[Bot Script] ${paused ? '⏸️ Bot PAUSED' : '▶️ Bot RESUMED'}`);
        };

        // Send message to a channel
        window.sendMessage = async (channelId, messageContent) => {
            try {
                console.log(`[Bot Script] 🚀 Sending message "${messageContent}" to channel ${channelId}`);
                const response = await fetch(`${window.apiBaseUrl}/channels/${channelId}/messages`, {
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

                if (!response.ok) {
                    const errorText = await response.text();
                    console.log(`[Bot Script] ❌ Message API Error: ${errorText}`);
                    throw new Error(`Failed to send message: ${response.status} - ${errorText}`);
                }

                const responseData = await response.json();
                console.log(`[Bot Script] ✅ Message sent to channel ${channelId}, Message ID: ${responseData._id}`);
                return responseData;
            } catch (error) {
                console.error(`[Bot Script] ❌ Error sending message: ${error.message}`);
                throw error;
            }
        };

        // Get all channels in the server
        window.getAllChannels = async () => {
            try {
                // Try to get channels from the client state
                const state = window.__state || window.store || window.revoltClient;
                
                if (state && state.channels) {
                    const channels = Object.values(state.channels);
                    return channels.filter(channel => channel.server === window.serverId);
                }
                
                // If we can't get from state, return empty array
                return [];
            } catch (error) {
                console.error(`[Bot Script] Error getting channels: ${error.message}`);
                return [];
            }
        };

        // Send messages to all unprocessed channels
        window.sendMessagesToAllChannels = async () => {
            if (isPaused) return;

            try {
                // Get current channels
                const channels = await window.getAllChannels();
                
                // Update our channel list
                channels.forEach(channel => {
                    allChannels.add(channel._id);
                });
                
                // Send messages to channels that haven't been processed yet
                for (const channel of channels) {
                    if (!window.channelTracker.has(channel._id)) {
                        try {
                            // Generate random suffix
                            const suffixes = ["..2", "..3", "..4", "..5"];
                            const randomSuffix = suffixes[Math.floor(Math.random() * suffixes.length)];
                            
                            // Send message
                            await window.sendMessage(channel._id, randomSuffix);
                            
                            // Mark as processed
                            window.channelTracker.add(channel._id);
                            messageCount++;
                            
                            console.log(`[Bot Script] ✓ Channel ${channel._id} marked as processed (${messageCount} total)`);
                        } catch (error) {
                            console.error(`[Bot Script] Failed to send message to channel ${channel._id}: ${error.message}`);
                            // Still mark as processed to avoid retrying
                            window.channelTracker.add(channel._id);
                        }
                    }
                }
            } catch (error) {
                console.error(`[Bot Script] Error in sendMessagesToAllChannels: ${error.message}`);
            }
        };

        // Handle new channel creation
        window.handleNewChannel = async (data) => {
            if (isPaused) return;

            const channelId = data._id;
            const channelName = data.name;
            const serverId = data.server;
            
            // Only process Exclusive Orders server channels
            if (serverId !== window.serverId) {
                return;
            }
            
            console.log(`[Bot Script] 🎯 New channel detected: ${channelName} (${channelId})`);
            
            // Add to our channel list
            allChannels.add(channelId);
            
            // If this channel hasn't been processed yet, send a message immediately
            if (!window.channelTracker.has(channelId)) {
                try {
                    // Generate random suffix
                    const suffixes = ["..2", "..3", "..4", "..5"];
                    const randomSuffix = suffixes[Math.floor(Math.random() * suffixes.length)];
                    
                    // Send message immediately
                    await window.sendMessage(channelId, randomSuffix);
                    
                    // Mark as processed
                    window.channelTracker.add(channelId);
                    messageCount++;
                    
                    console.log(`[Bot Script] ✓ New channel ${channelId} processed immediately (${messageCount} total)`);
                } catch (error) {
                    console.error(`[Bot Script] Failed to send message to new channel: ${error.message}`);
                    // Still mark as processed to avoid retrying
                    window.channelTracker.add(channelId);
                }
            }
        };

        // Set up WebSocket interception for ChannelCreate events
        const OriginalWebSocket = window.WebSocket;
        Object.defineProperty(window, 'WebSocket', {
            get() {
                return new Proxy(OriginalWebSocket, {
                    construct(target, args) {
                        const ws = new target(...args);
                        ws.addEventListener('message', (event) => {
                            try {
                                const data = JSON.parse(event.data);
                                
                                // Look for ChannelCreate events in Exclusive Orders server
                                if (data.type === "ChannelCreate" && data.server === window.serverId) {
                                    console.log('[Bot Script] 🎯 ChannelCreate event detected!', data);
                                    // Process immediately
                                    window.handleNewChannel(data);
                                }
                                
                                // Also look for ServerUpdate events to get channel list
                                if (data.type === "ServerUpdate" && data.id === window.serverId && data.data && data.data.channels) {
                                    console.log('[Bot Script] 📋 ServerUpdate event detected, updating channel list');
                                    // Update our channel list with the latest from the server
                                    data.data.channels.forEach(channelId => {
                                        allChannels.add(channelId);
                                    });
                                }
                            } catch (e) {
                                // Ignore non-JSON messages
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
        
        // Start continuous messaging
        window.startContinuousMessaging = () => {
            console.log(`[Bot Script] Starting continuous messaging every ${window.messageInterval}ms...`);
            
            // Initialize channels
            window.getAllChannels().then(channels => {
                console.log(`[Bot Script] Found ${channels.length} channels initially`);
                
                // Start the continuous messaging interval
                messageInterval = setInterval(window.sendMessagesToAllChannels, window.messageInterval);
            });
        };

        // Stop continuous messaging
        window.stopContinuousMessaging = () => {
            if (messageInterval) {
                clearInterval(messageInterval);
                messageInterval = null;
                console.log('[Bot Script] Continuous messaging stopped');
            }
        };

        console.log('[Bot Script] Continuous messaging bot is ready.');
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
        console.error("❌ Could not find token.");
        return;
    }

    // --- Part 2: "Arm" the continuous messaging bot ---
    console.log("🔐 Arming the continuous messaging bot...");
    
    // Initialize channel tracker
    const CLEANUP_CONFIG = {
        expirationTime: 24 * 60 * 60 * 1000,  // 24 hours in ms
        cleanupInterval: 60 * 60 * 1000,      // 1 hour in ms
        maxEntries: 100000                     // Maximum entries to track
    };
    
    // Initialize the bot in the browser context
    await page.evaluate(({ 
        token, 
        serverId, 
        apiBaseUrl,
        messageInterval,
        cleanupConfig
    }) => {
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

        // Start cleanup timer
        window.channelTracker.startCleanup();
        
        // Set global variables
        window.authToken = token;
        window.serverId = serverId;
        window.apiBaseUrl = apiBaseUrl;
        window.messageInterval = messageInterval;
        window.generateNonce = () => Date.now().toString(36) + Math.random().toString(36).substring(2);
        
        console.log('[Bot Script] Continuous messaging bot is ARMED and ready!');
        console.log('[Bot Script] Server ID:', serverId);
        console.log('[Bot Script] Message interval:', messageInterval + 'ms');
        
        // Start continuous messaging
        window.startContinuousMessaging();
        
    }, { 
        token: authToken, 
        serverId: EXCLUSIVE_ORDERS_SERVER_ID,
        apiBaseUrl: API_BASE_URL,
        messageInterval: MESSAGE_INTERVAL,
        cleanupConfig: CLEANUP_CONFIG
    });

    console.log("🚀 Continuous messaging bot is now running!");
    console.log("   - Sending messages to all channels every 0.3 seconds");
    console.log("   - Stopping messages to channels that have been processed");
    console.log("   - Immediate response to new channel creation events");
    
    // Set up command line interface
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    // Add status command
    const showStatus = async () => {
        const status = await page.evaluate(() => {
            return {
                channelTracker: window.channelTracker.getStatus(),
                messageCount: window.messageCount || 0
            };
        });
        
        console.log("\n--- Bot Status ---");
        console.log(`Processed Channels: ${status.channelTracker.totalChannels}`);
        console.log(`Messages Sent: ${status.messageCount}`);
        console.log(`Continuous Messaging: Active`);
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
            await page.evaluate(() => window.stopContinuousMessaging());
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