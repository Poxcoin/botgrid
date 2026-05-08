import { chromium } from 'playwright';

const URL_BASE = 'https://kadoclub.net';
const SETTLE_MS = 1500;

const PUBLIC_ROUTES = [
  '/',
  '/bots',
  '/strategies',
  '/pricing',
  '/news',
  '/news/markets',
  '/auth',
  '/auth?mode=register',
  '/legal/risk-disclosure',
  '/legal/terms',
  '/waitlist',
  '/this-route-does-not-exist',
];

const DASHBOARD_TABS = [
  'overview', 'bot', 'analytics', 'pnl', 'trades', 'signals', 'logs', 'backtester',
  'account', 'security', 'settings',
];

const MOCK_USER = {
  id: 1, email: 'demo@kadoclub.net', username: 'demo', plan: 'performance',
  email_verified: true, has_api_keys: true, tg_connected: true, tg_username: 'demo_kado',
  totp_enabled: true, trial_days_left: 0, subscription_expires: '2026-12-31T00:00:00Z',
};
const MOCK_INVOICE = {
  current_week_pnl: 184.32, projected_fee: 36.86,
  wallet_trc20: 'TKzxdSv7XweDe5R7ABCDxYZabcDEFghijK',
  week_label: 'Week 19',
  invoice: { id: 12, label: 'Week 18', gross_pnl: 220.5, fee: 44.1, notified: false, fee_paid: false },
};

async function setupMocks(ctx) {
  const ARRAY_ENDPOINTS = [
    '/api/users/trades', '/api/users/pnl', '/api/users/logs',
    '/api/news', '/api/users/api-keys',
  ];
  const json = (data) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });

  await ctx.route('**/api/users/me', r => r.fulfill(json(MOCK_USER)));
  await ctx.route('**/api/billing/invoice/current', r => r.fulfill(json(MOCK_INVOICE)));
  await ctx.route('**/api/backtest/runs', r => r.fulfill(json({ runs: [] })));
  await ctx.route('**/api/backtest/status', r => r.fulfill(json({ running: false, progress: { current: 0, total: 0 } })));
  await ctx.route(/\/api\/signals(\?|$)/, r => r.fulfill(json({ signals: [], total: 0, pages: 1 })));
  await ctx.route('**/api/stats', r => r.fulfill(json({ total_trades: 12, win_rate: 66.7, long_count: 8, short_count: 4, total_pnl: 142.5 })));
  await ctx.route('**/api/data', r => r.fulfill(json({ balance: { total: 0, free: 0 }, latest_signals: [] })));
  await ctx.route('**/api/intel', r => r.fulfill(json({ sources: { rss: true, telegram: true, liquidations: true, onchain: false } })));
  await ctx.route('**/api/analytics/breakdown', r => r.fulfill(json({
    summary: { total_trades: 12, wins: 8, losses: 4, total_pnl: 142.5, first_trade: '2026-04-01' },
    by_bot: [], by_coin: [], daily: [], best: [], worst: [],
  })));
  await ctx.route('**/api/logs**', r => r.fulfill(json({ lines: ['[INFO] system ready'] })));

  const SPECIFIC = [
    '/api/users/me', '/api/billing/invoice/current', '/api/backtest/runs', '/api/backtest/status',
    '/api/signals', '/api/stats', '/api/data', '/api/intel', '/api/analytics/breakdown', '/api/logs',
  ];
  await ctx.route('**/api/**', async route => {
    const url = route.request().url();
    if (SPECIFIC.some(p => url.includes(p))) return route.fallback();
    if (ARRAY_ENDPOINTS.some(p => url.includes(p))) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
}

const findings = [];

function attachListeners(page, label) {
  page.on('console', msg => {
    const t = msg.type();
    if (t === 'error' || t === 'warning') {
      findings.push({ route: label, type: t, text: msg.text() });
    }
  });
  page.on('pageerror', err => {
    findings.push({ route: label, type: 'pageerror', text: err.message });
  });
  page.on('requestfailed', req => {
    const failure = req.failure();
    if (!failure) return;
    // Ignore Cloudflare RUM beacons aborted by route navigation — expected
    // browser behavior, not an app-side error.
    if (failure.errorText === 'net::ERR_ABORTED' && req.url().includes('/cdn-cgi/rum')) return;
    findings.push({ route: label, type: 'reqfail', text: `${req.method()} ${req.url()} — ${failure.errorText}` });
  });
}

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 1,
});
await setupMocks(ctx);
const page = await ctx.newPage();
attachListeners(page, '<init>');

await page.addInitScript(() => {
  localStorage.setItem('kado_token', 'fake-token-sweep');
  localStorage.setItem('kado_user', JSON.stringify({ email: 'demo@kadoclub.net', plan: 'performance' }));
  localStorage.setItem('kado_cookie_consent', 'rejected');
});

console.log('=== Public routes ===');
for (const route of PUBLIC_ROUTES) {
  findings.length = 0;
  attachListeners(page, route);
  await page.goto(`${URL_BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(SETTLE_MS);
  const errs = findings.filter(f => f.route === route);
  console.log(`[${route}] ${errs.length} issue(s)`);
  for (const e of errs) console.log(`  ${e.type}: ${e.text.slice(0, 220)}`);
  page.removeAllListeners();
}

console.log('\n=== Dashboard tabs ===');
attachListeners(page, '/account');
await page.goto(`${URL_BASE}/account`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(2500);
for (const tab of DASHBOARD_TABS) {
  const before = findings.length;
  await page.evaluate(id => window.dispatchEvent(new CustomEvent('switch-tab', { detail: id })), tab);
  await page.waitForTimeout(SETTLE_MS);
  const errs = findings.slice(before);
  console.log(`[/account#${tab}] ${errs.length} issue(s)`);
  for (const e of errs) console.log(`  ${e.type}: ${e.text.slice(0, 220)}`);
}

await browser.close();
console.log('\nDone.');
