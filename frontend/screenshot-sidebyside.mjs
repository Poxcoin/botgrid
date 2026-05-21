import { chromium } from 'playwright';
const browser = await chromium.launch({ channel:'msedge', headless:true });
const ctx = await browser.newContext({ viewport:{width:1920,height:1080}, deviceScaleFactor:1 });
const page = await ctx.newPage();
await page.addInitScript(() => {
  localStorage.setItem('kado_cookie_consent','accepted');
  localStorage.setItem('kado_lang','uk');
});
await page.goto('https://kadoclub.net/?nuke=' + Date.now(), { waitUntil:'networkidle', timeout:30000 });
await page.waitForTimeout(2500);

// Bot pill section — focus on first row of bot cards
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.32));
await page.waitForTimeout(1500);
const botBox = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('a[href="/bots"]')].filter(a => a.offsetWidth > 200);
  if (!cards.length) return null;
  const r0 = cards[0].getBoundingClientRect();
  const r1 = cards[1] ? cards[1].getBoundingClientRect() : r0;
  return { x: r0.x, y: r0.y, width: (r1.x + r1.width) - r0.x, height: r0.height };
});
if (botBox) await page.screenshot({ path:'screenshots/sxs-bots.png', clip: { x: Math.max(0,botBox.x-10), y: Math.max(0,botBox.y-10), width: botBox.width+20, height: botBox.height+20 } });

await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.64));
await page.waitForTimeout(1500);
const stratBox = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('a[href="/strategies"]')].filter(a => a.offsetWidth > 200);
  if (!cards.length) return null;
  const r0 = cards[0].getBoundingClientRect();
  const r1 = cards[1] ? cards[1].getBoundingClientRect() : r0;
  return { x: r0.x, y: r0.y, width: (r1.x + r1.width) - r0.x, height: r0.height };
});
if (stratBox) await page.screenshot({ path:'screenshots/sxs-strats.png', clip: { x: Math.max(0,stratBox.x-10), y: Math.max(0,stratBox.y-10), width: stratBox.width+20, height: stratBox.height+20 } });

console.log('OK');
await browser.close();
