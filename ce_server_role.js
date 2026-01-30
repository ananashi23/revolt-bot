// ce_server_role.js - Fixed version to properly display role IDs and permissions
import { chromium } from 'playwright';
import readline from 'readline';

// --- Configuration ---
// Only the CE server is targeted
const SERVER_NAMES = {
    "01K7A7CNSMC5XPTJ7J36H9XKGR": "Foodcity"
};

const TARGET_SERVER_IDS = Object.keys(SERVER_NAMES);

console.log("--- Starting Revolt Server Roles Viewer (Foodcity Only) ---");

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
    console.log("🧠 Injecting the role fetching logic for CE server...");
    await context.addInitScript(() => {
        // Helper function to get current local time as a formatted string
        window.getLocalTime = () => {
            const now = new Date();
            return now.toLocaleString();
        };
        
        console.log('[Role Script] Logic injected. Ready to fetch server roles...');
        
        // Function to fetch and display server roles
        window.fetchServerRoles = async (serverId, serverName) => {
            console.log(`[Role Script] 🎯 Fetching roles for ${serverName} server (${serverId})...`);
            
            // Try the correct API endpoint for server details (which includes roles)
            const apiUrl = `https://workers.api.onech.at/servers/${serverId}`;
            
            try {
                console.log(`[Role Script] 🚀 Fetching server details from API...`);
                
                const response = await fetch(apiUrl, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-session-token': window.authToken
                    }
                });
                
                console.log(`[Role Script] 📡 API Response Status: ${response.status} ${response.statusText}`);
                
                if (!response.ok) {
                    const errorText = await response.text();
                    console.log(`[Role Script] ❌ API Error Response: ${errorText}`);
                    return null;
                }
                
                const serverData = await response.json();
                console.log(`[Role Script] ✅ Successfully fetched server data at ${window.getLocalTime()}`);
                
                return serverData;
            } catch (error) {
                console.error(`[Role Script] ❌ An error occurred during fetch: ${error.message}`);
                return null;
            }
        };
        
        // Function to format and display roles
        window.displayRoles = (serverData, serverName) => {
            if (!serverData) {
                console.log(`[Role Script] ⚠️ No server data found for ${serverName}`);
                return;
            }
            
            console.log(`\n========== ROLES FOR ${serverName.toUpperCase()} SERVER ==========`);
            
            // Check if roles are directly in the server data
            if (serverData.roles && Object.keys(serverData.roles).length > 0) {
                // Create an array of roles with their IDs
                const rolesWithIds = Object.entries(serverData.roles).map(([id, role]) => ({
                    id: id,
                    ...role
                }));
                
                // Sort roles by rank/position if available
                const sortedRoles = rolesWithIds.sort((a, b) => {
                    // If rank property exists, sort by it (higher rank first)
                    if (a.rank !== undefined && b.rank !== undefined) {
                        return b.rank - a.rank;
                    }
                    // Otherwise sort by name
                    return a.name.localeCompare(b.name);
                });
                
                sortedRoles.forEach((role, index) => {
                    console.log(`${index + 1}. Role Name: ${role.name}`);
                    console.log(`   ID: ${role.id}`);
                    console.log(`   Color: ${role.colour || 'Default'}`);
                    // Use JSON.stringify to properly display the permissions object
                    console.log(`   Permissions: ${JSON.stringify(role.permissions)}`);
                    if (role.rank !== undefined) {
                        console.log(`   Rank: ${role.rank}`);
                    }
                    console.log('---');
                });
            } else {
                console.log(`[Role Script] ⚠️ No roles found in server data for ${serverName}`);
                console.log(`[Role Script] Server data keys: ${Object.keys(serverData).join(', ')}`);
            }
            
            console.log(`========== END OF ROLES FOR ${serverName.toUpperCase()} SERVER ==========\n`);
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

    // --- Part 2: "Arm" the script and fetch roles ---
    console.log("🔐 Arming the script with token and server information...");
    await page.evaluate(({ token, targetServerIds, serverNames }) => {
        window.authToken = token;
        window.targetServerIds = targetServerIds;
        window.serverNames = serverNames;
        console.log('[Role Script] Script is ARMED and ready.');
    }, { token: authToken, targetServerIds: TARGET_SERVER_IDS, serverNames: SERVER_NAMES });

    // Function to fetch and display roles for all target servers
    const fetchAndDisplayRoles = async () => {
        for (const serverId of TARGET_SERVER_IDS) {
            const serverName = SERVER_NAMES[serverId];
            // Fixed: Pass arguments as an object
            const serverData = await page.evaluate((params) => window.fetchServerRoles(params.id, window.serverNames[params.id]), { id: serverId });
            
            if (serverData) {
                // Fixed: Pass arguments as an object
                await page.evaluate((params) => window.displayRoles(params.data, params.name), { data: serverData, name: serverName });
            }
        }
    };

    // Initial fetch and display
    console.log("🚀 Fetching server roles...");
    await fetchAndDisplayRoles();

    console.log("✅ Server roles displayed. Type 'refresh' to update the list or 'exit' to quit.");
    
    // Set up command line interface
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.on('line', async (input) => {
        const command = input.trim().toLowerCase();
        if (command === 'refresh') {
            console.log("🔄 Refreshing server roles...");
            await fetchAndDisplayRoles();
            console.log("✅ Server roles updated. Type 'refresh' to update again or 'exit' to quit.");
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