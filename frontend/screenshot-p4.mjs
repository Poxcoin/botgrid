import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

mkdirSync('./screenshots/p4', { recursive: true });

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });

// Mocks for /account
const json = (d) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(d) });
const ME_CONNECTED = {
  id: 1, email: 'demo@kadoclub.net', plan: 'performance',
  email_verified: true, has_api_keys: true, api_key_testnet: false,
  totp_enabled: true, trial_days_left: 0,
};
const ME_DISCONNECTED = { ...ME_CONNECTED, has_api_keys: false, api_key_testnet: false };
const TRADES = [
  { id: 1, symbol: 'BTC/USDT:USDT', side: 'LONG', source: 'news', entry_price: 64500.5, exit_price: null, pnl_usdt: 12.34, status: 'open', opened_at: '2026-05-08T10:00:00Z' },
  { id: 2, symbol: 'ETH/USDT:USDT', side: 'SHORT', source: 'fr', entry_price: 3210.1, exit_price: 3180.0, pnl_usdt: -5.5, status: 'closed', opened_at: '2026-05-07T08:00:00Z' },
  { id: 3, symbol: 'SOL/USDT:USDT', side: 'LONG', source: 'whale', entry_price: 145.2, exit_price: 152.1, pnl_usdt: 32.0, status: 'closed', opened_at: '2026-05-06T14:00:00Z' },
];
const PNL = [{ year: 2026, month: 5, gross_pnl: 184.5, performance_fee: 36.9, net_pnl: 147.6, fee_paid: false }];
const DATA = { balance: { total: 1840.32, free: 1530.12 }, latest_signals: [] };
const BREAKDOWN = {
  summary: { total_trades: 12, wins: 8, losses: 4, total_pnl: 142.5, first_trade: '2026-04-01' },
  by_bot: [
    { source: 'news', trades: 8, wins: 6, pnl: 92.4, avg_win: 18.2, avg_loss: -8.1 },
    { source: 'fr', trades: 4, wins: 2, pnl: -14.5, avg_win: 9.1, avg_loss: -16.5 },
    { source: 'whale', trades: 3, wins: 3, pnl: 64.6, avg_win: 21.5, avg_loss: 0 },
  ],
  by_coin: [], daily: [], best: [], worst: [],
};

async function setupMocks(connected = true) {
  await ctx.unrouteAll({ behavior: 'wait' });
  await ctx.route('**/api/users/me', r => r.fulfill(json(connected ? ME_CONNECTED : ME_DISCONNECTED)));
  await ctx.route('**/api/users/trades**', r => r.fulfill(json(TRADES)));
  await ctx.route('**/api/users/pnl', r => r.fulfill(json(PNL)));
  await ctx.route('**/api/data', r => r.fulfill(json(DATA)));
  await ctx.route('**/api/analytics/breakdown', r => r.fulfill(json(BREAKDOWN)));
  await ctx.route('**/api/billing/invoice/current', r => r.fulfill(json({ current_week_pnl: 0, projected_fee: 0, wallet_trc20: '', week_label: 'Week 19', invoice: null })));
  await ctx.route('**/api/intel', r => r.fulfill(json({ sources: {} })));
  await ctx.route('**/api/stats', r => r.fulfill(json({ total_trades: 12, win_rate: 66.7, long_count: 8, short_count: 4, total_pnl: 142.5 })));
  // Playwright matches handlers LIFO. Catch-all goes LAST in registration so
  // it's checked FIRST; for any URL we already mocked above we route.fallback()
  // so the specific handler wins.
  const SPECIFIC = [
    '/api/users/me', '/api/users/trades', '/api/users/pnl',
    '/api/data', '/api/analytics/breakdown', '/api/billing/invoice/current',
    '/api/intel', '/api/stats',
  ];
  await ctx.route('**/api/**', async route => {
    const url = route.request().url();
    if (SPECIFIC.some(p => url.includes(p))) return route.fallback();
    if (url.includes('/api/users/api-keys')) return route.fulfill(json([]));
    return route.fulfill(json({}));
  });
}

const page = await ctx.newPage();
page.on('pageerror', err => console.log('[ERROR]', err.message));
page.on('console', m => { if (m.type() === 'error') console.log('[console.err]', m.text().slice(0, 300)); });
await page.addInitScript(() => {
  localStorage.setItem('kado_token', 'fake-token');
  localStorage.setItem('kado_user', JSON.stringify({ email: 'demo@kadoclub.net', plan: 'performance' }));
  localStorage.setItem('kado_cookie_consent', 'rejected');
});

// 1. OverviewTab — connected (balance + per-bot table visible)
await setupMocks(true);
await page.goto('https://kadoclub.net/account', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
await page.screenshot({ path: './screenshots/p4/overview-connected.png', fullPage: true });
console.log('✓ overview-connected.png');

// 2. OverviewTab — disconnected (Connect Bybit CTA visible)
await setupMocks(false);
await page.goto('https://kadoclub.net/account', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
await page.screenshot({ path: './screenshots/p4/overview-disconnected.png', fullPage: true });
console.log('✓ overview-disconnected.png');

// 3. ApiKeysTab — connected, idle
await setupMocks(true);
await page.goto('https://kadoclub.net/account', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1800);
await page.evaluate(() => window.dispatchEvent(new CustomEvent('switch-tab', { detail: 'api-keys' })));
await page.waitForTimeout(1200);
await page.screenshot({ path: './screenshots/p4/api-keys-connected.png', fullPage: false });
console.log('✓ api-keys-connected.png');

// 4. ApiKeysTab — disconnected (no keys yet)
await setupMocks(false);
await page.goto('https://kadoclub.net/account', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1800);
await page.evaluate(() => window.dispatchEvent(new CustomEvent('switch-tab', { detail: 'api-keys' })));
await page.waitForTimeout(1200);
await page.screenshot({ path: './screenshots/p4/api-keys-disconnected.png', fullPage: false });
console.log('✓ api-keys-disconnected.png');

// 5. SecurityTab single-column (after split)
await setupMocks(true);
await page.goto('https://kadoclub.net/account', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1800);
await page.evaluate(() => window.dispatchEvent(new CustomEvent('switch-tab', { detail: 'security' })));
await page.waitForTimeout(1200);
await page.screenshot({ path: './screenshots/p4/security-tab.png', fullPage: false });
console.log('✓ security-tab.png');

await browser.close();
console.log('Done.');
