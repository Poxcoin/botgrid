import { chromium } from 'playwright';
const browser = await chromium.launch({ channel:'msedge', headless:true });
const ctx = await browser.newContext({ viewport:{width:1920,height:1080}, deviceScaleFactor:1, extraHTTPHeaders:{'Cache-Control':'no-cache'} });
const page = await ctx.newPage();
await page.addInitScript(() => localStorage.setItem('kado_cookie_consent','accepted'));
await page.goto('https://kadoclub.net/?v=' + Date.now(), { waitUntil:'domcontentloaded', timeout:30000 });
await page.waitForTimeout(2500);

// scroll to bots section
await page.evaluate(() => {
  const headings = [...document.querySelectorAll('h2, h3')];
  const target = headings.find(h => /bots|ботів|восемь/i.test(h.textContent || ''));
  if (target) target.scrollIntoView({block:'start'});
});
await page.waitForTimeout(800);
await page.screenshot({ path:'screenshots/bots-section.png', fullPage:false });

// scroll to strategies
await page.evaluate(() => {
  const headings = [...document.querySelectorAll('h2, h3')];
  const target = headings.find(h => /choose|варіант|profile|strategy/i.test(h.textContent || ''));
  if (target) target.scrollIntoView({block:'start'});
});
await page.waitForTimeout(800);
await page.screenshot({ path:'screenshots/strategies-section.png', fullPage:false });

console.log('OK');
await browser.close();
