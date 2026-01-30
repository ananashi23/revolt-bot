// get-cookies.js (Real Chrome Version)

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';

// Use the stealth plugin
puppeteer.use(StealthPlugin());

// --- PASTE YOUR CHROME PATH HERE ---
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'; // <-- IMPORTANT: Change this for your system!

console.log("Launching your real Chrome to get new cookies...");
console.log("IMPORTANT: Log in with your bot account when the browser opens.");

const browser = await puppeteer.launch({
    executablePath: CHROME_PATH, // Use your real Chrome
    headless: false,
    userDataDir: './get_cookies_profile' // Use a separate profile
});

const page = await browser.newPage();

console.log("Navigating to Revolt...");
await page.goto('https://revolt.onech.at', { waitUntil: 'networkidle2' });

console.log("Waiting for you to log in with the bot account...");
// Wait for the main app element to appear, which means login was successful
await page.waitForSelector('#app', { timeout: 90000 });

console.log("Login detected! Grabbing cookies...");

const cookies = await page.cookies();
await fs.promises.writeFile('./cookies.json', JSON.stringify(cookies, null, 2));

console.log("✅ New cookies saved to cookies.json!");
await browser.close();