import { chromium } from 'playwright';
const browser = await chromium.launch({ channel:'msedge', headless:true });
const ctx = await browser.newContext({ viewport:{width:1920,height:1080}, deviceScaleFactor:2 });
const page = await ctx.newPage();
await page.addInitScript(() => {
  localStorage.setItem('kado_cookie_consent','accepted');
  localStorage.setItem('kado_lang','uk');
});
await page.goto('https://kadoclub.net/?v=' + Date.now(), { waitUntil:'networkidle', timeout:30000 });
await page.waitForTimeout(2500);

await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.33));
await page.waitForTimeout(1500);
const box = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('a[href="/bots"]')].filter(a => a.offsetWidth > 200);
  if (cards.length) {
    const r = cards[0].getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }
  return null;
});
console.log('bot:', JSON.stringify(box));
if (box) {
  await page.screenshot({ path:'screenshots/zoom-bot.png', clip: { x: Math.max(0,box.x), y: Math.max(0,box.y), width: box.width, height: box.height } });
}

await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.65));
await page.waitForTimeout(1500);
const box2 = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('a[href="/strategies"]')].filter(a => a.offsetWidth > 200);
  if (cards.length) {
    const r = cards[0].getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }
  return null;
});
console.log('strat:', JSON.stringify(box2));
if (box2) {
  await page.screenshot({ path:'screenshots/zoom-strat.png', clip: { x: Math.max(0,box2.x), y: Math.max(0,box2.y), width: box2.width, height: box2.height } });
}
console.log('OK');
await browser.close();
