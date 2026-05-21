import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, existsSync, statSync } from 'fs';
import { extname, join, normalize } from 'path';

const PORT = 8888;
const ROOT = './../static';

const mime = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.map':'application/json' };
const srv = createServer((req, res) => {
  let p = (req.url || '/').split('?')[0];
  if (p === '/') p = '/index.html';
  const f = normalize(join(ROOT, p));
  if (existsSync(f) && statSync(f).isFile()) {
    res.writeHead(200, { 'Content-Type': mime[extname(f)] || 'text/plain' });
    res.end(readFileSync(f));
  } else if (p.startsWith('/api/')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{}');
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(readFileSync(join(ROOT, 'index.html')));
  }
});
srv.listen(PORT);

const browser = await chromium.launch({ channel:'msedge', headless:true });
const ctx = await browser.newContext({ viewport:{width:1280,height:900} });

const json = d => ({ status:200, contentType:'application/json', body:JSON.stringify(d) });
await ctx.route('**/api/users/me', r => r.fulfill(json({id:1,email:'d@x.com',username:'demo',plan:'performance',has_api_keys:true,totp_enabled:true,onboarding_completed:true,email_verified:true,trial_days_left:0})));
await ctx.route('**/api/users/balance', r => r.fulfill(json({usdt_wallet:5240,usdt_equity:5217,usdt_free:5183,unrealized_pnl:-22})));
await ctx.route('**/api/users/pnl', r => r.fulfill(json([])));
await ctx.route('**/api/users/closed-pnl**', r => r.fulfill(json({trades:[]})));
await ctx.route('**/api/**', r => r.fulfill(json({})));

const page = await ctx.newPage();
page.on('pageerror', e => {
  console.log('--- pageerror ---');
  console.log(e.message);
  console.log(e.stack);
});
page.on('console', m => {
  if (m.type() === 'error') console.log('--- console.error ---\n' + m.text());
});

await page.addInitScript(() => {
  localStorage.setItem('kado_token','fake');
  localStorage.setItem('kado_user', JSON.stringify({email:'d@x.com',plan:'performance',username:'demo'}));
  localStorage.setItem('kado_consent_v1', JSON.stringify({ legal:true, cookies:false, ts:new Date().toISOString() }));
});

await page.goto(`http://localhost:${PORT}/account`, { waitUntil:'networkidle', timeout:30000 });
await page.waitForTimeout(3000);
await browser.close();
srv.close();
