import { chromium } from 'playwright';
const browser = await chromium.launch({ channel:'msedge', headless:true });
const ctx = await browser.newContext({ viewport:{width:1920,height:1080}, deviceScaleFactor:1 });
const page = await ctx.newPage();
await page.addInitScript(() => {
  localStorage.setItem('kado_cookie_consent','accepted');
  localStorage.setItem('kado_lang','uk');
});
await page.goto('https://kadoclub.net/?v=' + Date.now(), { waitUntil:'networkidle', timeout:30000 });
await page.waitForTimeout(2500);

// Use anchor scroll
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.30));
await page.waitForTimeout(1500);
await page.screenshot({ path:'screenshots/uk-bots-y.png', fullPage:false });

await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.55));
await page.waitForTimeout(1500);
await page.screenshot({ path:'screenshots/uk-strategies-y.png', fullPage:false });

console.log('OK');
await browser.close();
