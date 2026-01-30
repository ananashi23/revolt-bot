// ce_channel_permissions.js - Fixed version to check channel permissions
import { chromium } from 'playwright';
import readline from 'readline';

// --- Configuration ---
// Only the CE server is targeted
const SERVER_NAMES = {
    "01JDKH82R0RHG2VF9YDWKEFHC5": "CE"
};

const TARGET_SERVER_IDS = Object.keys(SERVER_NAMES);

console.log("--- Starting Revolt Channel Permissions Checker (CE Server Only) ---");

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

    // --- Part 0: Inject the script logic ---
    console.log("🧠 Injecting the channel permission checking logic for CE server...");
    await context.addInitScript(() => {
        // Helper function to get current local time as a formatted string
        window.getLocalTime = () => {
            const now = new Date();
            return now.toLocaleString();
        };
        
        console.log('[Permission Script] Logic injected. Ready to check channel permissions...');
        
        // Function to fetch user information
        window.fetchUserInfo = async () => {
            console.log(`[Permission Script] 🎯 Fetching user information...`);
            
            const apiUrl = `https://workers.api.onech.at/users/@me`;
            
            try {
                console.log(`[Permission Script] 🚀 Fetching user data from API...`);
                
                const response = await fetch(apiUrl, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-session-token': window.authToken
                    }
                });
                
                console.log(`[Permission Script] 📡 API Response Status: ${response.status} ${response.statusText}`);
                
                if (!response.ok) {
                    const errorText = await response.text();
                    console.log(`[Permission Script] ❌ API Error Response: ${errorText}`);
                    return null;
                }
                
                const userData = await response.json();
                console.log(`[Permission Script] ✅ Successfully fetched user data at ${window.getLocalTime()}`);
                
                return userData;
            } catch (error) {
                console.error(`[Permission Script] ❌ An error occurred during fetch: ${error.message}`);
                return null;
            }
        };
        
        // Function to fetch server data (which includes channels)
        window.fetchServerData = async (serverId) => {
            console.log(`[Permission Script] 🎯 Fetching server data for ${serverId}...`);
            
            const apiUrl = `https://workers.api.onech.at/servers/${serverId}`;
            
            try {
                console.log(`[Permission Script] 🚀 Fetching server data from API...`);
                
                const response = await fetch(apiUrl, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-session-token': window.authToken
                    }
                });
                
                console.log(`[Permission Script] 📡 API Response Status: ${response.status} ${response.statusText}`);
                
                if (!response.ok) {
                    const errorText = await response.text();
                    console.log(`[Permission Script] ❌ API Error Response: ${errorText}`);
                    return null;
                }
                
                const serverData = await response.json();
                console.log(`[Permission Script] ✅ Successfully fetched server data at ${window.getLocalTime()}`);
                
                return serverData;
            } catch (error) {
                console.error(`[Permission Script] ❌ An error occurred during fetch: ${error.message}`);
                return null;
            }
        };
        
        // Function to check if user has permission to access a channel
        window.checkChannelPermission = (channel, userRoles, serverRoles) => {
            // If channel has no role permissions, assume it's accessible to everyone
            if (!channel.role_permissions || Object.keys(channel.role_permissions).length === 0) {
                return true;
            }
            
            // Check if any of the user's roles have permission to access this channel
            for (const roleId of userRoles) {
                if (channel.role_permissions[roleId] !== undefined) {
                    // If the role has permission (not denied), return true
                    if (channel.role_permissions[roleId] !== 0) {
                        return true;
                    }
                }
            }
            
            // If no explicit permission found, check if there's a default permission
            if (channel.default_permissions && channel.default_permissions !== 0) {
                return true;
            }
            
            // Default to false if no permission found
            return false;
        };
        
        // Function to format and display accessible channels
        window.displayAccessibleChannels = (serverData, userData, serverName) => {
            if (!serverData || !userData) {
                console.log(`[Permission Script] ⚠️ No data found for ${serverName}`);
                return;
            }
            
            console.log(`\n========== CHANNELS YOU HAVE ACCESS TO IN ${serverName.toUpperCase()} SERVER ==========`);
            
            // Get user's role IDs
            const userRoleIds = userData.roles || [];
            console.log(`[Permission Script] Your roles: ${userRoleIds.join(', ')}`);
            
            // Debug: Log server data structure
            console.log(`[Permission Script] Server data keys: ${Object.keys(serverData).join(', ')}`);
            
            // Check if server data includes channels
            if (!serverData.channels) {
                console.log(`[Permission Script] ⚠️ No channels found in server data for ${serverName}`);
                return;
            }
            
            // Convert channels object to array if it's an object
            let channelsArray;
            if (Array.isArray(serverData.channels)) {
                channelsArray = serverData.channels;
            } else if (typeof serverData.channels === 'object') {
                channelsArray = Object.entries(serverData.channels).map(([id, channel]) => ({
                    _id: id,
                    ...channel
                }));
            } else {
                console.log(`[Permission Script] ⚠️ Channels data is in an unexpected format: ${typeof serverData.channels}`);
                return;
            }
            
            console.log(`[Permission Script] Found ${channelsArray.length} channels in total`);
            
            // Filter channels the user has access to
            const accessibleChannels = channelsArray.filter(channel => 
                window.checkChannelPermission(channel, userRoleIds, serverData.roles)
            );
            
            console.log(`[Permission Script] You have access to ${accessibleChannels.length} channels`);
            
            if (accessibleChannels.length === 0) {
                console.log(`[Permission Script] ⚠️ You don't have access to any channels in ${serverName}`);
                return;
            }
            
            // Sort channels by type and name with better error handling
            const sortedChannels = accessibleChannels.sort((a, b) => {
                // Handle potential undefined values
                const aType = a.channel_type || '';
                const bType = b.channel_type || '';
                
                if (aType !== bType) {
                    return aType.localeCompare(bType);
                }
                
                // Handle potential undefined names
                const aName = a.name || '';
                const bName = b.name || '';
                
                return aName.localeCompare(bName);
            });
            
            // Group channels by type
            const channelsByType = {};
            sortedChannels.forEach(channel => {
                const type = channel.channel_type || 'Unknown';
                if (!channelsByType[type]) {
                    channelsByType[type] = [];
                }
                channelsByType[type].push(channel);
            });
            
            // Display channels by type
            for (const [type, channels] of Object.entries(channelsByType)) {
                console.log(`\n--- ${type.toUpperCase()} CHANNELS ---`);
                channels.forEach((channel, index) => {
                    const name = channel.name || 'Unnamed Channel';
                    const id = channel._id || 'Unknown ID';
                    console.log(`${index + 1}. ${name} (ID: ${id})`);
                    if (channel.description) {
                        console.log(`   Description: ${channel.description}`);
                    }
                });
            }
            
            console.log(`\n========== END OF ACCESSIBLE CHANNELS IN ${serverName.toUpperCase()} SERVER ==========\n`);
            console.log(`[Permission Script] You have access to ${accessibleChannels.length} out of ${channelsArray.length} channels in ${serverName}.`);
        };
    });
    
    // --- Part 1: Log in and fetch token ---
    await page.goto('https://workers.onech.at');
    
    console.log("Please log in to your account now.");
    console.log("Once you are successfully logged in and can see the app, press ENTER in this terminal to continue.");
    
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
        console.error("❌ Could not find token. The script will not work.");
        return;
    }

    // --- Part 2: "Arm" the script and fetch data ---
    console.log("🔐 Arming the script with token and server information...");
    await page.evaluate(({ token, targetServerIds, serverNames }) => {
        window.authToken = token;
        window.targetServerIds = targetServerIds;
        window.serverNames = serverNames;
        console.log('[Permission Script] Script is ARMED and ready.');
    }, { token: authToken, targetServerIds: TARGET_SERVER_IDS, serverNames: SERVER_NAMES });

    // Function to fetch and display accessible channels for all target servers
    const fetchAndDisplayAccessibleChannels = async () => {
        for (const serverId of TARGET_SERVER_IDS) {
            const serverName = SERVER_NAMES[serverId];
            
            // Fetch user information
            const userData = await page.evaluate(() => window.fetchUserInfo());
            
            // Fetch server data (which includes channels)
            const serverData = await page.evaluate((params) => window.fetchServerData(params.id), { id: serverId });
            
            if (userData && serverData) {
                // Display accessible channels
                await page.evaluate((params) => window.displayAccessibleChannels(
                    params.server, 
                    params.user, 
                    params.name
                ), { 
                    server: serverData, 
                    user: userData, 
                    name: serverName 
                });
            }
        }
    };

    // Initial fetch and display
    console.log("🚀 Fetching channel permissions...");
    await fetchAndDisplayAccessibleChannels();

    console.log("✅ Channel permissions displayed. Type 'refresh' to update the list or 'exit' to quit.");
    
    // Set up command line interface
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.on('line', async (input) => {
        const command = input.trim().toLowerCase();
        if (command === 'refresh') {
            console.log("🔄 Refreshing channel permissions...");
            await fetchAndDisplayAccessibleChannels();
            console.log("✅ Channel permissions updated. Type 'refresh' to update again or 'exit' to quit.");
        } else if (command === 'exit') {
            console.log("Shutting down the script...");
            rl.close();
            await browser.close();
            process.exit(0);
        } else if (command !== '') {
            console.log("Unknown command. Available commands: refresh, exit");
        }
    });
})();