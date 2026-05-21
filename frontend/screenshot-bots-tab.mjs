import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const URL_BASE = 'https://kadoclub.net';
const OUT_DIR = './screenshots';
mkdirSync(OUT_DIR, { recursive: true });

const MOCK_USER = {
  id: 1, email: 'demo@kadoclub.net', username: 'demo', plan: 'performance',
  email_verified: true, has_api_keys: true, tg_connected: true, tg_username: 'demo',
  totp_enabled: true, trial_days_left: 0, subscription_expires: '2026-12-31T00:00:00Z',
  onboarding_completed: true,
};

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });

await ctx.route('**/api/users/me', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_USER) }));
await ctx.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));

const page = await ctx.newPage();
page.on('pageerror', e => console.log('[err]', e.message));

await page.addInitScript(() => {
  localStorage.setItem('kado_token', 'fake');
  localStorage.setItem('kado_user', JSON.stringify({ email: 'demo@kadoclub.net', plan: 'performance', username: 'demo' }));
  localStorage.setItem('kado_cookie_consent', JSON.stringify({ analytics: false, ts: Date.now() }));
});

console.log('Landing...');
await page.goto(`${URL_BASE}/?cb=${Date.now()}`, { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT_DIR}/verify-landing-header.png`, clip: { x: 0, y: 0, width: 1920, height: 80 } });

console.log('Account (logged in)...');
await page.goto(`${URL_BASE}/account?cb=${Date.now()}`, { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(2000);
await page.screenshot({ path: `${OUT_DIR}/verify-account-sidebar.png`, clip: { x: 0, y: 0, width: 280, height: 1000 } });
await page.screenshot({ path: `${OUT_DIR}/verify-account-full.png`, fullPage: false });

await browser.close();
console.log('Done.');
