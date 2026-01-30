// bot.js (Basic Connectivity Test)
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

puppeteer.use(StealthPlugin());

console.log("Starting basic connectivity test...");

const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false, // Keep it visible so you can see what happens
    args: ['--no-sandbox', '--disable-setuid-sandbox']
});

const page = await browser.newPage();

try {
    console.log("Navigating to google.com...");
    await page.goto('https://www.google.com', { waitUntil: 'networkidle2', timeout: 15000 });
    console.log("✅ SUCCESS! Puppeteer can access the internet.");
    await page.screenshot({ path: 'test.png' });
    console.log("Saved a screenshot to 'test.png' in your project folder.");
} catch (error) {
    console.error("❌ FAILED! Puppeteer could not access the internet.");
    console.error("Error:", error.message);
}

await browser.close();
console.log("Test finished.");