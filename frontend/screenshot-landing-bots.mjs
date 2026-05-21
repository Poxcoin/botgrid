import { chromium } from 'playwright';
const browser = await chromium.launch({ channel:'msedge', headless:true });
const ctx = await browser.newContext({ viewport:{width:1920,height:1080}, deviceScaleFactor:1 });
const page = await ctx.newPage();
await page.addInitScript(() => localStorage.setItem('kado_cookie_consent','accepted'));
await page.goto('https://kadoclub.net/', { waitUntil:'domcontentloaded', timeout:30000 });
await page.waitForTimeout(2500);
// scroll on landing (no click — stay on /)
await page.evaluate(() => {
  // find a section whose header contains arsenal label or several bot names
  const all = document.querySelectorAll('section, div');
  for (const el of all) {
    const t = (el.textContent || '').toLowerCase();
    const labelHits = ['signal','grid','cascade','listing','funding','sniper'].filter(l => t.includes(l)).length;
    if (labelHits >= 5 && el.offsetHeight > 400 && el.offsetHeight < 2000) {
      el.scrollIntoView({ block: 'start' });
      return;
    }
  }
});
await page.waitForTimeout(800);
await page.screenshot({ path:'screenshots/landing-bots.png', fullPage:false });
console.log('OK');
await browser.close();
