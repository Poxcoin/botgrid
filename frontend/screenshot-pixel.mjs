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

// Print ALL pills + their PARENT card colors
const data = await page.evaluate(() => {
  function digest(link) {
    const cardCS = window.getComputedStyle(link.firstElementChild || link);
    const pills = [...link.querySelectorAll('span')].filter(s => {
      const cs = window.getComputedStyle(s);
      return cs.borderRadius && parseFloat(cs.borderRadius) > 50;
    }).map(s => {
      const cs = window.getComputedStyle(s);
      return { text: s.textContent.slice(0,30), color: cs.color, bg: cs.backgroundColor, border: cs.borderColor };
    });
    return { cardBg: cardCS.backgroundColor, cardBorder: cardCS.borderColor, pills };
  }
  const bots = [...document.querySelectorAll('a[href="/bots"]')].filter(a => a.offsetWidth > 200);
  const strats = [...document.querySelectorAll('a[href="/strategies"]')].filter(a => a.offsetWidth > 200);
  return {
    bot0: bots[0] ? digest(bots[0]) : null,
    strat0: strats[0] ? digest(strats[0]) : null,
  };
});
console.log(JSON.stringify(data, null, 2));
await browser.close();
