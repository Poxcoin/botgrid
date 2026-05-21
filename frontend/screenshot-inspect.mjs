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

// Inspect computed styles
const data = await page.evaluate(() => {
  // find a bot top-right tag (inside link to /bots) and a strategy tag
  const botLinks = [...document.querySelectorAll('a[href="/bots"]')].filter(a => a.offsetWidth > 200);
  const stratLinks = [...document.querySelectorAll('a[href="/strategies"]')].filter(a => a.offsetWidth > 200);
  function pickPills(link) {
    const spans = [...link.querySelectorAll('span')];
    return spans.filter(s => {
      const r = window.getComputedStyle(s);
      return r.borderRadius && parseFloat(r.borderRadius) > 50;
    }).map(s => {
      const cs = window.getComputedStyle(s);
      return {
        text: s.textContent.slice(0,30),
        fontSize: cs.fontSize,
        color: cs.color,
        background: cs.backgroundColor,
        border: cs.borderTop,
        padding: cs.padding,
        letterSpacing: cs.letterSpacing,
        fontFamily: cs.fontFamily.slice(0,30),
      };
    });
  }
  return {
    bot: botLinks[0] ? pickPills(botLinks[0]) : 'no bot card',
    strat: stratLinks[0] ? pickPills(stratLinks[0]) : 'no strat card',
  };
});
console.log(JSON.stringify(data, null, 2));
await browser.close();
