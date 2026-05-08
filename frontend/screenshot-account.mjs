import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const URL_BASE = 'https://kadoclub.net';
const OUT_DIR = './screenshots';

mkdirSync(OUT_DIR, { recursive: true });

const MOCK_USER = {
  id: 1,
  email: 'demo@kadoclub.net',
  username: 'demo',
  plan: 'performance',
  email_verified: true,
  has_api_keys: true,
  tg_connected: true,
  tg_username: 'demo_kado',
  totp_enabled: true,
  trial_days_left: 0,
  subscription_expires: '2026-12-31T00:00:00Z',
};

const MOCK_INVOICE = {
  current_week_pnl: 184.32,
  projected_fee: 36.86,
  wallet_trc20: 'TKzxdSv7XweDe5R7ABCDxYZabcDEFghijK',
  week_label: 'Week 19',
  invoice: {
    id: 12,
    label: 'Week 18 (May 1–7)',
    gross_pnl: 220.50,
    fee: 44.10,
    notified: false,
    fee_paid: false,
  },
};

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 2,
});

// Intercept API calls and return mock data so the page renders without a real backend session
await ctx.route('**/api/users/me', route =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_USER) })
);
await ctx.route('**/api/billing/invoice/current', route =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_INVOICE) })
);
// Mock backtest runs as empty so we see the empty-state copy
await ctx.route('**/api/backtest/runs', route =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ runs: [] }) })
);
// Mock signals as empty paginated payload
await ctx.route(/\/api\/signals(\?|$)/, route =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ signals: [], total: 0, pages: 1 }) })
);
// Stats with non-null fields so SignalsTab StatBoxes don't show '—'
await ctx.route('**/api/stats', route =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    total_trades: 12, win_rate: 66.7, long_count: 8, short_count: 4, total_pnl: 142.50,
  }) })
);
// Bot data (BotTab)
await ctx.route('**/api/data', route =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    balance: { total: 0, free: 0 }, latest_signals: [],
  }) })
);
await ctx.route('**/api/intel', route =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    sources: { rss: true, telegram: true, liquidations: true, onchain: false },
  }) })
);
// Endpoints that the dashboard expects to return arrays — return empty array to avoid .filter crashes
const ARRAY_ENDPOINTS = [
  '/api/users/trades', '/api/users/pnl', '/api/users/logs',
  '/api/signals', '/api/news', '/api/users/api-keys',
];
const SPECIFIC_ROUTES = [
  '/api/users/me', '/api/billing/invoice/current', '/api/backtest/runs',
  '/api/signals', '/api/stats', '/api/data', '/api/intel',
];
// Generic mock for any other /api/* call (specific routes registered above take priority via fallback)
await ctx.route('**/api/**', async route => {
  const url = route.request().url();
  if (SPECIFIC_ROUTES.some(p => url.includes(p))) return route.fallback();
  if (ARRAY_ENDPOINTS.some(p => url.includes(p))) {
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
});

const page = await ctx.newPage();

page.on('console', msg => console.log(`[browser ${msg.type()}]`, msg.text()));
page.on('pageerror', err => console.log('[browser ERROR]', err.message));

// Set fake token before app boots so ProtectedRoute lets us through
await page.addInitScript(() => {
  localStorage.setItem('kado_token', 'fake-token-screenshot');
  localStorage.setItem('kado_user', JSON.stringify({ email: 'demo@kadoclub.net', plan: 'performance' }));
});

console.log('Navigating to /account...');
await page.goto(`${URL_BASE}/account`, { waitUntil: 'domcontentloaded', timeout: 30000 });

// Wait for app to render
await page.waitForTimeout(2500);

console.log('Switching to account tab via switch-tab event...');
await page.evaluate(() => {
  window.dispatchEvent(new CustomEvent('switch-tab', { detail: 'account' }));
});
await page.waitForTimeout(1500);

// Debug: capture page text content
const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 600));
console.log('--- BODY TEXT (first 600 chars) ---');
console.log(bodyText);
console.log('--- END ---');

// Screenshot 1: Account tab (Profile section opened by default)
await page.screenshot({ path: `${OUT_DIR}/account-profile-default.png`, fullPage: false });
console.log('✓ account-profile-default.png');

// Open Telegram section
const tgSection = page.locator('button:has-text("Telegram")').first();
if (await tgSection.count()) {
  await tgSection.click();
  await page.waitForTimeout(300);
}
await page.screenshot({ path: `${OUT_DIR}/account-telegram-open.png`, fullPage: false });
console.log('✓ account-telegram-open.png');

// Open Billing section
const billingSection = page.locator('button:has-text("Billing")').first();
if (await billingSection.count()) {
  await billingSection.click();
  await page.waitForTimeout(400);
}
await page.screenshot({ path: `${OUT_DIR}/account-billing-open.png`, fullPage: false });
console.log('✓ account-billing-open.png');

// Full page (all sections potentially open)
await page.screenshot({ path: `${OUT_DIR}/account-fullpage.png`, fullPage: true });
console.log('✓ account-fullpage.png');

// Now go to Settings tab via custom event
console.log('Switching to Settings tab...');
await page.evaluate(() => window.dispatchEvent(new CustomEvent('switch-tab', { detail: 'settings' })));
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT_DIR}/settings-default.png`, fullPage: false });
console.log('✓ settings-default.png');

// Open all sections in Settings
const sectionLabels = ['Theme', 'Timezone', 'Notifications', 'Tema', 'Тема', 'Часовий пояс', 'Сповіщення'];
for (const label of sectionLabels) {
  const btn = page.locator(`button:has-text("${label}")`).first();
  if (await btn.count()) {
    try { await btn.click({ timeout: 1000 }); } catch {}
  }
}
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT_DIR}/settings-all-open.png`, fullPage: true });
console.log('✓ settings-all-open.png');

// ── Tour additional tabs in dashboard ────────────────────────────────────
const tabs = ['overview', 'bot', 'analytics', 'pnl', 'trades', 'logs', 'backtester', 'signals'];
for (const tab of tabs) {
  await page.evaluate((id) => window.dispatchEvent(new CustomEvent('switch-tab', { detail: id })), tab);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT_DIR}/dash-${tab}.png`, fullPage: false });
  console.log(`✓ dash-${tab}.png`);
}

// ── Landing page (no auth needed) ────────────────────────────────────────
console.log('Visiting landing...');
await page.goto(`${URL_BASE}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT_DIR}/landing-hero.png`, fullPage: false });
console.log('✓ landing-hero.png');
await page.evaluate(() => window.scrollTo(0, 1200));
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT_DIR}/landing-bots.png`, fullPage: false });
console.log('✓ landing-bots.png');

// ── Pricing page ─────────────────────────────────────────────────────────
console.log('Visiting pricing...');
await page.goto(`${URL_BASE}/pricing`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(2000);
await page.screenshot({ path: `${OUT_DIR}/pricing-hero.png`, fullPage: false });
console.log('✓ pricing-hero.png');
await page.evaluate(() => window.scrollTo(0, 400));
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT_DIR}/pricing-cards.png`, fullPage: false });
console.log('✓ pricing-cards.png');

await browser.close();
console.log('Done.');
