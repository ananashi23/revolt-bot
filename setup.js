// setup.js - The "Stealth" version to hide from anti-bot detection.
import { chromium } from 'playwright';

const storageStatePath = './storage-state.json';

console.log("--- Starting Revolt Bot Setup (Stealth Version) ---");

(async () => {
    // Use a real browser's user agent
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

    const browser = await chromium.launch({ 
        headless: false,
        args: [
            '--disable-blink-features=AutomationControlled', // Crucial for hiding automation
            '--no-sandbox',
            '--disable-setuid-sandbox'
        ]
    });

    const context = await browser.newContext({
        userAgent: userAgent,
        viewport: { width: 1920, height: 1080 },
        locale: 'en-US',
        // Remove the 'window.webdriver' property
        extraHTTPHeaders: {
            'Accept-Language': 'en-US,en;q=0.9'
        }
    });

    // This is a key trick to remove the navigator.webdriver property
    await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined,
        });
    });

    const page = await context.newPage();
    
    await page.goto('https://revolt.onech.at');
    
    console.log("Please log in. Once you are logged in, press ENTER in this terminal.");
    await new Promise(resolve => process.stdin.once('data', resolve));
    
    await context.storageState({ path: storageStatePath });
    
    console.log(`\n✅ Success! Session saved to '${storageStatePath}'.`);
    console.log("You can now run: node bot.js");
    
    await browser.close();
})();