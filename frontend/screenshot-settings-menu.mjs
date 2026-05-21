import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const URL = 'http://localhost:5173';
const OUT = './screenshots/settings-menu';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();

await page.addInitScript(() => {
  localStorage.setItem('kado_cookie_consent', 'accepted');
});

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(2500);

// Find the gear button (settings) in the header
const gear = await page.locator('header button[title="Open menu"]').count() > 0
  ? null
  : page.locator('header button').filter({ has: page.locator('svg path[d*="M12 15a3 3"]') }).first();

// Better: target by aria/icon — gear has the cogwheel SVG with that path
const gearBtn = page.locator('header button:has(svg path[d^="M12 15a3 3"])').first();

await gearBtn.scrollIntoViewIfNeeded();
await gearBtn.click();
await page.waitForTimeout(400);

// Shot 1: dropdown initial
await page.screenshot({
  path: `${OUT}/01-initial.png`,
  clip: { x: 880, y: 0, width: 380, height: 460 },
});
console.log('✓ 01-initial.png');

// Click language row to expand — find by globe SVG inside a clickable parent
const langRow = page.locator('div').filter({ hasText: /^Language$|^Мова$|^Idioma$|^Sprache$|^Язык$|^语言$/ }).first();
await langRow.click({ timeout: 5000 }).catch(e => console.log('lang click failed:', e.message));
await page.waitForTimeout(500);

await page.screenshot({
  path: `${OUT}/02-language-expanded.png`,
  clip: { x: 880, y: 0, width: 380, height: 600 },
});
console.log('✓ 02-language-expanded.png');

// Click Light theme button
const lightBtn = page.locator('button:has-text("Світла"), button:has-text("Light")').first();
await lightBtn.click({ timeout: 5000 }).catch(() => {});
await page.waitForTimeout(400);

await page.screenshot({
  path: `${OUT}/03-light-theme.png`,
  clip: { x: 880, y: 0, width: 380, height: 600 },
});
console.log('✓ 03-light-theme.png');

await browser.close();
console.log('Done.');
