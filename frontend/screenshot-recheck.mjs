import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'msedge', headless: true });

// 1. Landing with full hero animation (4s wait)
const ctx1 = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
const page1 = await ctx1.newPage();
await page1.addInitScript(() => localStorage.setItem('kado_cookie_consent', 'accepted'));
await page1.goto('https://kadoclub.net/', { waitUntil: 'domcontentloaded' });
await page1.waitForTimeout(4500);
await page1.screenshot({ path: './screenshots/live/landing-settled.png', fullPage: false });
console.log('✓ landing-settled.png');

// 2. Cookie banner — fresh context, no consent, wait for banner mount
const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
const page2 = await ctx2.newPage();
await page2.goto('https://kadoclub.net/', { waitUntil: 'domcontentloaded' });
await page2.waitForTimeout(3500);
const bannerVisible = await page2.evaluate(() => {
  const dialog = document.querySelector('div[role="dialog"][aria-label="Cookie consent"]');
  return dialog ? { found: true, text: dialog.innerText.slice(0, 200) } : { found: false };
});
console.log('Banner check:', JSON.stringify(bannerVisible));
await page2.screenshot({ path: './screenshots/live/cookie-banner.png', fullPage: false });
console.log('✓ cookie-banner.png');

await browser.close();
