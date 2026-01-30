// token_checker.js

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

puppeteer.use(StealthPlugin());

if (!fs.existsSync('./cookies.json')) {
    console.error("ERROR: cookies.json not found!");
    process.exit(1);
}

console.log("Checking for a fresh token...");

const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    userDataDir: './bot_chrome_profile',
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zygote', '--disable-gpu']
});

const page = await browser.newPage();

console.log("Logging in...");
await page.goto('https://revolt.onech.at', { waitUntil: 'networkidle2' });
const cookies = JSON.parse(fs.readFileSync('./cookies.json'));
await page.setCookie(...cookies);
await page.goto('https://revolt.onech.at', { waitUntil: 'networkidle2' });
await page.waitForSelector('#app', { timeout: 60000 });
console.log("✅ Logged in and app is ready.");

console.log("Fetching authentication token from IndexedDB...");
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
    console.log(`✅ Found token: ${authToken}`);
} else {
    console.error("❌ Could not find token.");
}

await browser.close();