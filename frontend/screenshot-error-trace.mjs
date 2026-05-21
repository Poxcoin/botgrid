import { chromium, devices } from 'playwright';

const browser = await chromium.launch({ channel:'msedge', headless:true });
const ctx = await browser.newContext({ viewport:{width:1280,height:900} });

const json = d => ({ status:200, contentType:'application/json', body:JSON.stringify(d) });
await ctx.route('**/api/users/me', r => r.fulfill(json({id:1,email:'d@x.com',username:'demo',plan:'performance',has_api_keys:true,totp_enabled:true,onboarding_completed:true,email_verified:true,trial_days_left:0})));
await ctx.route('**/api/users/balance', r => r.fulfill(json({usdt_wallet:5240,usdt_equity:5217,usdt_free:5183,unrealized_pnl:-22})));
await ctx.route('**/api/users/pnl', r => r.fulfill(json([])));
await ctx.route('**/api/users/closed-pnl**', r => r.fulfill(json({trades:[]})));
await ctx.route('**/api/**', r => r.fulfill(json({})));

const page = await ctx.newPage();

// Override window.onerror BEFORE app loads to capture errors before ErrorBoundary
await page.addInitScript(() => {
  window.__capturedErrors = [];
  window.addEventListener('error', e => {
    window.__capturedErrors.push({ msg: e.message, stack: e.error?.stack?.slice(0, 600), file: e.filename, line: e.lineno });
  });
  // Patch console.error
  const oerr = console.error;
  console.error = function(...a) {
    window.__capturedErrors.push({ msg: 'console.error: ' + a.map(x => String(x)).join(' ') });
    oerr.apply(console, a);
  };
  localStorage.setItem('kado_token','fake');
  localStorage.setItem('kado_user', JSON.stringify({email:'d@x.com',plan:'performance',username:'demo'}));
  localStorage.setItem('kado_consent_v1', JSON.stringify({ legal:true, cookies:false, ts:new Date().toISOString() }));
});

await page.goto('https://kadoclub.net/account?cb='+Date.now(), { waitUntil:'networkidle', timeout:30000 });
await page.waitForTimeout(3000);

const errs = await page.evaluate(() => window.__capturedErrors || []);
for (const e of errs.slice(0, 5)) {
  console.log('--- ERR ---');
  console.log(e.msg);
  if (e.stack) console.log(e.stack);
  if (e.file) console.log(`@ ${e.file}:${e.line}`);
}
await browser.close();
