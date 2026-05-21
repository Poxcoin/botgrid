import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const URL_BASE = 'https://kadoclub.net';
const OUT_DIR  = './screenshots';
mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx     = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page    = await ctx.newPage();

// Capture long tasks (>50ms) — every entry is a frame the user feels as lag.
await page.addInitScript(() => {
  window.__longTasks = [];
  try {
    new PerformanceObserver(list => {
      for (const e of list.getEntries()) window.__longTasks.push({ s: e.startTime, d: e.duration });
    }).observe({ entryTypes: ['longtask'] });
  } catch {}
});

page.on('console', m => console.log(`[browser ${m.type()}]`, m.text()));
page.on('pageerror', e => console.log('[browser ERROR]', e.message));

async function probe(name, url, settle = 2500) {
  console.log(`\n=== ${name} :: ${url} ===`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(settle);

  // Long tasks during initial render
  const initialTasks = await page.evaluate(() => window.__longTasks.slice());
  const initialSlow  = initialTasks.filter(t => t.d > 50);
  console.log(`  long tasks during initial render: ${initialSlow.length} (top:`,
    initialSlow.sort((a, b) => b.d - a.d).slice(0, 5).map(t => `${t.d.toFixed(0)}ms`).join(','), ')');

  // Now simulate scroll + resize and see how charts behave
  await page.evaluate(() => { window.__longTasks = []; });
  for (let i = 0; i < 5; i++) {
    await page.evaluate(y => window.scrollTo({ top: y, behavior: 'smooth' }), i * 400);
    await page.waitForTimeout(300);
  }
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.waitForTimeout(400);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(800);

  const interactTasks = await page.evaluate(() => window.__longTasks.slice());
  const interactSlow  = interactTasks.filter(t => t.d > 50);
  console.log(`  long tasks during scroll+resize: ${interactSlow.length} (top:`,
    interactSlow.sort((a, b) => b.d - a.d).slice(0, 5).map(t => `${t.d.toFixed(0)}ms`).join(','), ')');

  // Count recharts/SVG elements present
  const svgCount   = await page.evaluate(() => document.querySelectorAll('svg').length);
  const pathCount  = await page.evaluate(() => document.querySelectorAll('path').length);
  const animatable = await page.evaluate(() => document.querySelectorAll('.recharts-area, .recharts-line, .recharts-bar-rectangle').length);
  console.log(`  DOM: ${svgCount} svg / ${pathCount} path / ${animatable} recharts shapes`);

  await page.screenshot({ path: `${OUT_DIR}/perf-${name}.png`, fullPage: false });
}

await probe('landing',     `${URL_BASE}/`);
await probe('strategies',  `${URL_BASE}/strategies`);
await probe('pricing',     `${URL_BASE}/pricing`);

await browser.close();
console.log('\nDone — screenshots in ./screenshots/perf-*.png');
