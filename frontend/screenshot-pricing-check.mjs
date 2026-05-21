import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const URL = 'https://kadoclub.net/pricing?v=' + Date.now(); // bust CF cache
const OUT = './screenshots/pricing';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1100 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.addInitScript(() => localStorage.setItem('kado_cookie_consent', 'accepted'));

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(2500);

// Full pricing section
await page.screenshot({ path: `${OUT}/01-full.png`, fullPage: false });

// Tight crop of the Performance card price area
const card = page.locator('text=PERFORMANCE').first();
const box = await card.boundingBox();
if (box) {
  await page.screenshot({
    path: `${OUT}/02-perf-card.png`,
    clip: { x: Math.max(0, box.x - 20), y: Math.max(0, box.y - 20), width: 560, height: 220 },
  });
}

// Verify DOM does not contain "20%" anywhere related to monthly profit
const html = await page.content();
const has20 = /20\s*%/.test(html.replace(/(\+|-)?20%/g, ''));  // crude — but pricing has "+10%"/"+20%" elsewhere? on /pricing not.
const allMatches = (html.match(/\b\d{1,2}%/g) || []).slice(0, 30);
console.log('Percentages found in DOM:', allMatches.join(', '));

await browser.close();
console.log('✓ done');
