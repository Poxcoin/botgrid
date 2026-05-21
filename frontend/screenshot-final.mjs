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

// Header
await page.screenshot({ path:'screenshots/final-header.png', clip: { x:0, y:0, width:1920, height:90 } });

// Footer — scroll to bottom
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(1200);
await page.screenshot({ path:'screenshots/final-footer.png', clip: { x:0, y:1080-400, width:1920, height:400 } });

console.log('OK');
await browser.close();
