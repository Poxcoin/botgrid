import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const URL = 'https://kadoclub.net';
const OUT = './screenshots/prod-theme';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'msedge', headless: true });

async function shot(theme, name) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: theme === 'light' ? 'light' : 'dark',
  });
  const page = await ctx.newPage();
  await page.addInitScript(t => {
    localStorage.setItem('kado_theme', t);
    localStorage.setItem('kado_cookie_consent', 'accepted');
  }, theme);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // Full header strip
  await page.screenshot({ path: `${OUT}/${name}-header.png`, clip: { x: 0, y: 0, width: 1440, height: 220 } });
  // Hero / first viewport
  await page.screenshot({ path: `${OUT}/${name}-hero.png`, clip: { x: 0, y: 0, width: 1440, height: 900 } });

  // Open settings dropdown
  const gear = page.locator('header button:has(svg path[d^="M12 15a3 3"])').first();
  await gear.click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${name}-dropdown.png`, clip: { x: 1060, y: 0, width: 380, height: 480 } });

  // Verify what the document.documentElement.classList is and what colorScheme it uses
  const state = await page.evaluate(() => ({
    htmlClass: document.documentElement.className,
    colorScheme: document.documentElement.style.colorScheme,
    stored: localStorage.getItem('kado_theme'),
    bgColor: getComputedStyle(document.body).backgroundColor,
    fgColor: getComputedStyle(document.body).color,
  }));
  console.log(`${name}:`, JSON.stringify(state));

  await ctx.close();
}

// Test with no stored pref + system=light (should pick light)
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  colorScheme: 'light',
});
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
const fresh = await page.evaluate(() => ({
  htmlClass: document.documentElement.className,
  colorScheme: document.documentElement.style.colorScheme,
  stored: localStorage.getItem('kado_theme'),
}));
console.log('fresh-visit-system-light:', JSON.stringify(fresh));
await page.screenshot({ path: `${OUT}/00-fresh-system-light.png`, clip: { x: 0, y: 0, width: 1440, height: 220 } });
await ctx.close();

// Explicit dark and light
await shot('dark',  '01-dark');
await shot('light', '02-light');

await browser.close();
console.log('Done.');
