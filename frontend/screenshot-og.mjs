import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE = path.resolve(__dirname, 'og-template.html');
const OUTPUT = path.resolve(__dirname, 'public', 'og-image.png');

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1,
});
const page = await ctx.newPage();
await page.goto(`file://${TEMPLATE}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await page.screenshot({ path: OUTPUT, type: 'png', omitBackground: false });
console.log(`✓ wrote ${OUTPUT}`);
await browser.close();
