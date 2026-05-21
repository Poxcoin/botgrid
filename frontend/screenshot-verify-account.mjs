import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const URL_BASE = 'https://kadoclub.net';
const OUT_DIR = './screenshots';
mkdirSync(OUT_DIR, { recursive: true });

const MOCK_USER = {
  id: 1, email: 'demo@kadoclub.net', username: 'demo', plan: 'performance',
  email_verified: true, has_api_keys: true, tg_connected: true, tg_username: 'demo',
  totp_enabled: true, trial_days_left: 0, subscription_expires: '2026-12-31T00:00:00Z',
};
const MOCK_INVOICE = {
  current_week_pnl: -246.71, projected_fee: 0, wallet_trc20: 'TKzxdSv7XweDe5R7ABCDxYZabcDEFghijK',
  week_label: 'Week 21 (May 18-24)',
  invoice: { id: 12, label: 'Week 21', gross_pnl: -246.71, fee: 0, notified: false, fee_paid: false },
};

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });

await ctx.route('**/api/users/me', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_USER) }));
await ctx.route('**/api/billing/invoice/current', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_INVOICE) }));
await ctx.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));

const page = await ctx.newPage();
page.on('pageerror', e => console.log('[browser ERROR]', e.message));

await page.addInitScript(() => {
  localStorage.setItem('kado_token', 'fake');
  localStorage.setItem('kado_user', JSON.stringify({ email: 'demo@kadoclub.net', plan: 'performance' }));
  localStorage.setItem('kado_cookie_consent', JSON.stringify({ analytics: false, ts: Date.now() }));
});

for (const path of ['/account', '/settings', '/api-keys']) {
  console.log('Visiting', path);
  await page.goto(`${URL_BASE}${path}?cb=${Date.now()}`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  const file = `${OUT_DIR}/verify${path.replace(/\//g, '-')}.png`;
  await page.screenshot({ path: file, fullPage: false });
  console.log('  saved', file);
}

await browser.close();
console.log('Done.');
