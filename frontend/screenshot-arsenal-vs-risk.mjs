import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const URL = 'https://kadoclub.net';
const OUT = './screenshots/arsenal-vs-risk';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  colorScheme: 'dark',
});
const page = await ctx.newPage();
await page.addInitScript(() => {
  localStorage.setItem('kado_theme', 'dark');
  localStorage.setItem('kado_cookie_consent', 'accepted');
});
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

for (const [name, re] of [
  ['arsenal', /Eight bots\. One platform/i],
  ['risk',    /Your capital is protected/i],
]) {
  const el = page.locator('section').filter({ hasText: re }).first();
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await el.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`✓ ${name}.png`);
}

await browser.close();
console.log('Done.');
