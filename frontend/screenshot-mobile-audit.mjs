import { chromium, devices } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('./screenshots/mobile', { recursive: true });

const URL_BASE = 'https://kadoclub.net';

const MOCK_USER = {
  id:1, email:'demo@x.com', username:'demo', plan:'performance',
  email_verified:true, has_api_keys:true, tg_connected:true, tg_username:'demo',
  totp_enabled:true, trial_days_left:0, subscription_expires:'2026-12-31T00:00:00Z',
  onboarding_completed:true,
};

const browser = await chromium.launch({ channel:'msedge', headless:true });
const ctx = await browser.newContext({
  ...devices['iPhone 13'],
  hasTouch: true, isMobile: true,
});

const json = d => ({ status:200, contentType:'application/json', body:JSON.stringify(d) });
await ctx.route('**/api/users/me', r => r.fulfill(json(MOCK_USER)));
await ctx.route('**/api/users/balance', r => r.fulfill(json({usdt_wallet:5240,usdt_equity:5217,usdt_free:5183,unrealized_pnl:-22})));
await ctx.route('**/api/users/pnl', r => r.fulfill(json([])));
await ctx.route('**/api/users/closed-pnl**', r => r.fulfill(json({trades:[]})));
await ctx.route('**/api/**', r => r.fulfill(json({})));

const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('ERR '+e.message));

await page.addInitScript(() => {
  localStorage.setItem('kado_token','fake');
  localStorage.setItem('kado_user', JSON.stringify({email:'demo@x.com',plan:'performance',username:'demo'}));
  localStorage.setItem('kado_consent_v1', JSON.stringify({ legal:true, cookies:false, ts:new Date().toISOString() }));
  localStorage.setItem('kado_cookie_consent', 'rejected');
});

const routes = [
  ['/', 'landing'],
  ['/bots', 'bots'],
  ['/strategies', 'strategies'],
  ['/pricing', 'pricing'],
  ['/account', 'account'],
  ['/trade', 'trade'],
  ['/auth', 'auth'],
];

for (const [path, name] of routes) {
  console.log('mobile', path);
  await page.goto(`${URL_BASE}${path}?cb=${Date.now()}`, { waitUntil:'networkidle', timeout:30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `./screenshots/mobile/${name}.png` });
  // Also a full-page version for landing/pricing/strategies
  if (['landing','bots','strategies','pricing'].includes(name)) {
    await page.screenshot({ path: `./screenshots/mobile/${name}-full.png`, fullPage:true });
  }
}

// Open mobile drawer
console.log('mobile /account with drawer');
await page.goto(`${URL_BASE}/account?cb=${Date.now()}`, { waitUntil:'networkidle', timeout:30000 });
await page.waitForTimeout(1500);
const burger = await page.$('button[aria-label="Open menu"], button:has-text("☰")');
if (burger) {
  await burger.click().catch(()=>{});
  await page.waitForTimeout(800);
  await page.screenshot({ path: './screenshots/mobile/account-drawer.png' });
}

console.log('errors:', errors.length);
console.log(errors.join('\n'));
await browser.close();
