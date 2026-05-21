import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const URL_BASE = 'https://kadoclub.net';
mkdirSync('./screenshots/audit', { recursive: true });

const MOCK_USER = {
  id:1, email:'demo@x.com', username:'demo', plan:'performance',
  email_verified:true, has_api_keys:true, tg_connected:true, tg_username:'demo',
  totp_enabled:true, trial_days_left:0, subscription_expires:'2026-12-31T00:00:00Z',
  onboarding_completed:true,
};
const MOCK_ANALYTICS = {
  has_key:true,
  summary:{ total_trades:24, total_pnl:347.82, wins:16, losses:8, win_rate:66.7 },
  daily:[
    {date:'2026-05-10',pnl:42.1,trades:3},{date:'2026-05-11',pnl:-12.5,trades:2},
    {date:'2026-05-12',pnl:88.3,trades:4},{date:'2026-05-13',pnl:24.0,trades:2},
    {date:'2026-05-14',pnl:-31.2,trades:3},{date:'2026-05-15',pnl:55.1,trades:3},
    {date:'2026-05-16',pnl:18.4,trades:2},{date:'2026-05-17',pnl:67.9,trades:3},
    {date:'2026-05-18',pnl:-5.2,trades:1},{date:'2026-05-19',pnl:100.0,trades:1},
  ],
  by_coin:[{coin:'BTC',trades:8,pnl:120.5,wins:6,avg_win:25,avg_loss:-10}],
  by_source:[{source:'signal',label:'Signal Bot',trades:12,pnl:200,wins:8,avg_win:30,avg_loss:-12}],
  best:[],worst:[],
};
const MOCK_TRADES = {
  trades: Array.from({length:24}, (_,i) => ({
    symbol: ['BTC','ETH','SOL','XRP'][i%4],
    side: i%3===0?'SHORT':'LONG',
    pnl: (Math.sin(i)*40 + (i%5===0?-20:15)).toFixed(2),
    source: ['signal','grid','cascade','orderflow'][i%4],
    closed_at: String(Date.now() - i*3600*1000*8),
    opened_at: String(Date.now() - i*3600*1000*8 - 7200*1000),
    entry_price: 60000+i*100,
    exit_price: 60000+i*100+(i%3===0?-300:200),
    qty: 0.01,
  }))
};

const browser = await chromium.launch({ channel:'msedge', headless:true });
const ctx = await browser.newContext({ viewport:{width:1600,height:1000} });

const json = d => ({ status:200, contentType:'application/json', body:JSON.stringify(d) });
await ctx.route('**/api/users/me', r => r.fulfill(json(MOCK_USER)));
await ctx.route('**/api/users/analytics', r => r.fulfill(json(MOCK_ANALYTICS)));
await ctx.route('**/api/users/balance', r => r.fulfill(json({usdt_wallet:5240.18,usdt_equity:5217.65,usdt_free:5183.42,unrealized_pnl:-22.53})));
await ctx.route('**/api/users/pnl', r => r.fulfill(json([])));
await ctx.route('**/api/users/closed-pnl**', r => r.fulfill(json(MOCK_TRADES)));
await ctx.route('**/api/users/trades**', r => r.fulfill(json([])));
await ctx.route('**/api/**', r => r.fulfill(json({})));

const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(['ERR',e.message]));
page.on('console', m => { if(m.type()==='error' && !/CSP|Content Security/i.test(m.text())) errors.push(['CON',m.text()]); });

await page.addInitScript(() => {
  localStorage.setItem('kado_token','fake');
  localStorage.setItem('kado_user', JSON.stringify({email:'demo@x.com',plan:'performance',username:'demo'}));
  localStorage.setItem('kado_consent_v1', JSON.stringify({ legal:true, cookies:false, ts:new Date().toISOString() }));
  localStorage.setItem('kado_cookie_consent', 'rejected');
});

const routes = [
  ['/', 'landing'],
  ['/bots', 'bots-marketing'],
  ['/strategies', 'strategies'],
  ['/pricing', 'pricing'],
  ['/account', 'account-analytics'],
  ['/trade', 'trade-bots'],
];

for (const [path, name] of routes) {
  console.log('Visiting', path);
  await page.goto(`${URL_BASE}${path}?cb=${Date.now()}`, { waitUntil:'networkidle', timeout:30000 });
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `./screenshots/audit/${name}.png`, fullPage: false });
}

// Account tabs
const tabs = ['analytics','trades','account','api-keys','security','settings'];
for (const tab of tabs) {
  await page.evaluate(id => window.dispatchEvent(new CustomEvent('switch-tab', {detail:id})), tab);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `./screenshots/audit/account-${tab}.png`, fullPage: false });
}

console.log('\n=== Runtime errors ===');
console.log(errors.length ? errors.map(([k,t])=>`[${k}] ${t.slice(0,200)}`).join('\n') : '(none)');
await browser.close();
