import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const URL = 'https://kadoclub.net';
const OUT = './screenshots/landing-sections';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  colorScheme: 'dark',
});
const page = await ctx.newPage();
await page.addInitScript(() => {
  localStorage.setItem('kado_theme', 'dark');
  localStorage.setItem('kado_cookie_consent', 'accepted');
});
await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(2000);

// Locate each section by text — h2/h3
const sections = [
  { name: 'arsenal',    text: /Eight bots\. One platform/i },
  { name: 'risk',       text: /Risk|Risiko|Riesgo|Ризик/i },
  { name: 'strategies', text: /Three strategies|Drei Strategien|Стратег/i },
];

for (const { name, text } of sections) {
  try {
    const el = page.locator('section').filter({ hasText: text }).first();
    await el.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    const box = await el.boundingBox();
    if (box) {
      await page.screenshot({
        path: `${OUT}/${name}.png`,
        clip: { x: 0, y: 0, width: 1440, height: Math.min(900, box.height + 40) },
        fullPage: false,
      });
      console.log(`✓ ${name}.png — box height ${Math.round(box.height)}px`);
    } else {
      console.log(`✗ ${name} — no bounding box`);
    }
  } catch (e) {
    console.log(`✗ ${name} —`, e.message);
  }
}

await browser.close();
console.log('Done.');
