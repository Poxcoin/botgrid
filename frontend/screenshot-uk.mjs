import { chromium } from 'playwright';
const browser = await chromium.launch({ channel:'msedge', headless:true });
const ctx = await browser.newContext({ viewport:{width:1920,height:1080}, deviceScaleFactor:1 });
const page = await ctx.newPage();
await page.addInitScript(() => {
  localStorage.setItem('kado_cookie_consent','accepted');
  localStorage.setItem('kado_lang','uk');
});
await page.goto('https://kadoclub.net/?nocache=' + Date.now(), { waitUntil:'networkidle', timeout:30000 });
await page.waitForTimeout(2000);

// Scroll to "Вісім ботів" h2 on landing
await page.evaluate(() => {
  const h = [...document.querySelectorAll('h2, h3, div')].find(x => /Вісім ботів/i.test(x.textContent||''));
  if (h) h.scrollIntoView({block:'start'});
});
await page.waitForTimeout(1500);
await page.screenshot({ path:'screenshots/uk-bots-section.png', fullPage:false });

// Scroll to Стратегії
await page.evaluate(() => {
  const h = [...document.querySelectorAll('h2, h3, div')].find(x => /Знайдіть свій варіант/i.test(x.textContent||''));
  if (h) h.scrollIntoView({block:'start'});
});
await page.waitForTimeout(1500);
await page.screenshot({ path:'screenshots/uk-strategies-section.png', fullPage:false });

console.log('OK');
await browser.close();
