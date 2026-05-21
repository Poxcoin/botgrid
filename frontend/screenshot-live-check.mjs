import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const URL_BASE = 'https://kadoclub.net';
const OUT = './screenshots/live';
mkdirSync(OUT, { recursive: true });

const SHOTS = [
  { path: '/',                       file: 'landing.png',     full: false },
  { path: '/legal/risk-disclosure',  file: 'risk.png',        full: true  },
  { path: '/legal/terms',            file: 'terms.png',       full: true  },
  { path: '/this-route-does-not-exist', file: 'not-found.png', full: false },
  { path: '/auth?mode=register',     file: 'auth-register.png', full: false },
  { path: '/pricing',                file: 'pricing.png',     full: false },
];

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

await page.addInitScript(() => {
  // Pre-accept consent so the cookie banner does not cover the page.
  localStorage.setItem('kado_cookie_consent', 'accepted');
});

for (const s of SHOTS) {
  await page.goto(`${URL_BASE}${s.path}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${OUT}/${s.file}`, fullPage: s.full });
  console.log(`✓ ${s.file}`);
}

// Mobile shot of landing
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${URL_BASE}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/landing-mobile.png`, fullPage: false });
console.log('✓ landing-mobile.png');

// Cookie banner visible (clear consent)
await page.evaluate(() => localStorage.removeItem('kado_cookie_consent'));
await page.setViewportSize({ width: 1280, height: 900 });
await page.goto(`${URL_BASE}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/landing-cookie-banner.png`, fullPage: false });
console.log('✓ landing-cookie-banner.png');

await browser.close();
