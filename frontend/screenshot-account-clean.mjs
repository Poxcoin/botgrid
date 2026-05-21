import { chromium } from 'playwright';
const MOCK_USER = { id:1, email:'demo@kadoclub.net', username:'demo', plan:'performance', email_verified:true, has_api_keys:true, tg_connected:true, tg_username:'demo_kado', totp_enabled:true, trial_days_left:0, subscription_expires:'2026-12-31T00:00:00Z', onboarding_step:'done' };
const MOCK_INVOICE = { current_week_pnl:184.32, projected_fee:36.86, wallet_trc20:'TKzxdSv7XweDe5R7ABCDxYZabcDEFghijK', week_label:'Week 19', invoice:{id:12,label:'Week 18 (May 1-7)',gross_pnl:220.50,fee:44.10,notified:false,fee_paid:false} };
const browser = await chromium.launch({ channel:'msedge', headless:true });
const ctx = await browser.newContext({ viewport:{width:1920,height:1080}, deviceScaleFactor:1 });
await ctx.route('**/api/users/me', r => r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(MOCK_USER)}));
await ctx.route('**/api/billing/invoice/current', r => r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(MOCK_INVOICE)}));
await ctx.route('**/api/onboarding/step', r => r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({step:'done'})}));
await ctx.route('**/api/**', r => r.fulfill({status:200,contentType:'application/json',body:'{}'}));
const page = await ctx.newPage();
await page.addInitScript(() => {
  localStorage.setItem('kado_token','fake-token');
  localStorage.setItem('kado_user', JSON.stringify({email:'demo@kadoclub.net',plan:'performance'}));
  localStorage.setItem('kado_cookie_consent','accepted');
  localStorage.setItem('kado_onboarding_dismissed','1');
  localStorage.setItem('kado_onboarding_done','1');
});
await page.goto('https://kadoclub.net/account', { waitUntil:'domcontentloaded', timeout:30000 });
await page.waitForTimeout(2500);
await page.evaluate(() => window.dispatchEvent(new CustomEvent('switch-tab', {detail:'account'})));
await page.waitForTimeout(800);
try { await page.locator('button:has-text("Get Started")').first().click({timeout:1500}); } catch {}
await page.waitForTimeout(400);
for (let i = 0; i < 4; i++) {
  try { await page.locator('text="Skip for now"').first().click({timeout:800}); break; } catch {}
  try { await page.locator('button:has-text("I\'ve connected my key")').first().click({timeout:800}); } catch {}
  try { await page.locator('button:has-text("Next")').first().click({timeout:800}); } catch {}
  await page.waitForTimeout(300);
}
await page.waitForTimeout(500);
// hide onboarding overlay if it persists
await page.evaluate(() => {
  document.querySelectorAll('div').forEach(d => {
    const s = getComputedStyle(d);
    if (s.position === 'fixed' && s.zIndex && parseInt(s.zIndex) > 50 && d.offsetWidth > 400) d.style.display = 'none';
  });
});
await page.waitForTimeout(300);
const tabs = ['account', 'api-keys', 'security', 'settings'];
for (const tab of tabs) {
  await page.evaluate(t => window.dispatchEvent(new CustomEvent('switch-tab', {detail:t})), tab);
  await page.waitForTimeout(700);
  await page.screenshot({ path:`screenshots/dash-${tab}.png`, fullPage:false });
  console.log('shot', tab);
}
await browser.close();
