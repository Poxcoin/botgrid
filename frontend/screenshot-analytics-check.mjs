import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });

await ctx.route('**/api/users/me', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id:1, email:'demo@x.com', username:'demo', plan:'performance', email_verified:true, has_api_keys:true, totp_enabled:true, onboarding_completed:true }) }));
await ctx.route('**/api/users/analytics', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ has_key:true, summary:{ total_trades:1, total_pnl:-8.41, wins:0, losses:1, win_rate:0 }, daily:[{ date:'2026-05-20', pnl:-8.41, trades:1 }], by_coin:[], by_source:[], best:[], worst:[] }) }));
await ctx.route('**/api/users/balance', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ usdt_wallet:1000, usdt_equity:991.59, usdt_free:983.18, unrealized_pnl:-0.42 }) }));
await ctx.route('**/api/users/pnl', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
await ctx.route('**/api/users/closed-pnl**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ trades:[{ symbol:'BTC', side:'LONG', pnl:-8.41, source:'orderflow', closed_at:String(Date.now()-3600000), opened_at:String(Date.now()-7200000), entry_price:60000, exit_price:59900, qty:0.01 }] }) }));
await ctx.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));

const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => { errors.push('[ERROR] '+e.message); console.log('[ERROR]', e.message); });
page.on('console', m => { if (m.type() === 'error') { errors.push('[CONSOLE] '+m.text()); console.log('[CONSOLE]', m.text()); } });
await page.addInitScript(() => {
  localStorage.setItem('kado_token', 'fake');
  localStorage.setItem('kado_user', JSON.stringify({ email:'demo@x.com', plan:'performance', username:'demo' }));
  localStorage.setItem('kado_cookie_consent', JSON.stringify({ analytics:false, ts:Date.now() }));
});
await page.goto('https://kadoclub.net/account?cb='+Date.now(), { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(1500);
// Click cookie consent if shown
const checkbox = await page.$('input[type="checkbox"]');
if (checkbox) {
  await checkbox.click().catch(()=>{});
  await page.waitForTimeout(300);
  const cont = await page.$('button:has-text("Continue")');
  if (cont) await cont.click().catch(()=>{});
  await page.waitForTimeout(1500);
}
await page.screenshot({ path: './screenshots/analytics-live.png', fullPage: false });
await page.screenshot({ path: './screenshots/analytics-live-full.png', fullPage: true });
console.log('errors:', errors.length);
console.log('Saved screenshot');
await browser.close();
