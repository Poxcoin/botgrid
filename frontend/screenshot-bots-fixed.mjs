import { chromium } from 'playwright';
const browser = await chromium.launch({ channel:'msedge', headless:true });
const ctx = await browser.newContext({ viewport:{width:1920,height:1080}, deviceScaleFactor:1 });
const page = await ctx.newPage();
await page.addInitScript(() => localStorage.setItem('kado_cookie_consent','accepted'));
await page.goto('https://kadoclub.net/?nocache=' + Date.now(), { waitUntil:'networkidle', timeout:30000 });
await page.waitForTimeout(1500);

// Click "Bots" nav link
await page.evaluate(() => {
  const links = [...document.querySelectorAll('a, button')];
  const bots = links.find(l => /^bots$|^боти$/i.test((l.textContent||'').trim()));
  if (bots) bots.click();
});
await page.waitForTimeout(1500);

// Find Eight bots / Вісім ботів h2 and scroll there
await page.evaluate(() => {
  const h = [...document.querySelectorAll('h2')].find(x => /eight|вісім|восемь/i.test(x.textContent||''));
  if (h) h.scrollIntoView({block:'start'});
});
await page.waitForTimeout(1200);
await page.screenshot({ path:'screenshots/bots-section.png', fullPage:false });

// Strategies
await page.evaluate(() => {
  const h = [...document.querySelectorAll('h2')].find(x => /choose|варіант|profile/i.test(x.textContent||''));
  if (h) h.scrollIntoView({block:'start'});
});
await page.waitForTimeout(1200);
await page.screenshot({ path:'screenshots/strategies-section.png', fullPage:false });

console.log('OK');
await browser.close();
