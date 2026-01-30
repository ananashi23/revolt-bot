// websocket-spy.js

import puppeteer from 'puppeteer';
import fs from 'fs';

console.log("Launching a browser to spy on the real WebSocket connection...");

// Load existing cookies to log you in automatically
if (!fs.existsSync('./cookies.json')) {
    console.error("cookies.json not found. Please run 'node get-cookies.js' first.");
    process.exit(1);
}
const cookies = JSON.parse(fs.readFileSync('./cookies.json'));

const browser = await puppeteer.launch({ headless: false });
const page = await browser.newPage();

// --- This is the magic: We replace the browser's WebSocket with our own spy ---
await page.evaluateOnNewDocument(() => {
    const OriginalWebSocket = window.WebSocket;
    
    // This function will be called whenever the Revolt app tries to create a WebSocket
    window.WebSocket = function(url, protocols) {
        console.log('========== REVOLT WEBSOCKET DETECTED ==========');
        console.log('URL:', url);
        
        // The headers are not usually accessible from here, but the URL is the most important part.
        // Sometimes the token is included as a query parameter in the URL.
        
        const ws = new OriginalWebSocket(url, protocols);

        ws.addEventListener('open', () => {
            console.log('✅ WebSocket connection opened successfully.');
        });
        ws.addEventListener('error', (error) => {
            console.error('❌ WebSocket error detected:', error);
        });
        ws.addEventListener('close', () => {
            console.log('WebSocket connection closed.');
        });

        return ws;
    };
    
    // Make sure our spy WebSocket behaves like the real one
    window.WebSocket.prototype = OriginalWebSocket.prototype;
    window.WebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
    window.WebSocket.OPEN = OriginalWebSocket.OPEN;
    window.WebSocket.CLOSING = OriginalWebSocket.CLOSING;
    window.WebSocket.CLOSED = OriginalWebSocket.CLOSED;
});

// Go to the page
await page.goto('https://revolt.onech.at');

// Set the cookies to be logged in
await page.setCookie(...cookies);

// Reload the page. This will trigger the Revolt app to load and try to connect.
console.log("Reloading page to trigger WebSocket connection with your session...");
await page.reload({ waitUntil: 'networkidle0' });

console.log("\n===============================================");
console.log("INSTRUCTIONS:");
console.log("1. The browser is now open and should be logged in.");
console.log("2. Press F12 to open Developer Tools.");
console.log("3. Go to the CONSOLE tab.");
console.log("4. Look for the '========== REVOLT WEBSOCKET DETECTED ==========' message.");
console.log("5. Copy the FULL URL it prints and paste it back here.");
console.log("===============================================");
console.log("\nThis script will stay running. Press Ctrl+C in this terminal to close it when you're done.");

// Keep the browser open so you can inspect it
await new Promise(() => {});