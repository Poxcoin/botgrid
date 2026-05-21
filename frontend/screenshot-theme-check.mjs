import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const URL = 'http://localhost:5173';
const OUT = './screenshots/theme-check';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'msedge', headless: true });

async function shot(theme, name) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  await page.addInitScript(t => {
    localStorage.setItem('kado_theme', t);
    localStorage.setItem('kado_cookie_consent', 'accepted');
  }, theme);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/${name}-full.png`, clip: { x: 0, y: 0, width: 1440, height: 220 } });
  console.log(`✓ ${name}-full.png`);
  await ctx.close();
}

await shot('dark',  '01-dark');
await shot('light', '02-light');

await browser.close();
console.log('Done.');
