const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.join('d:', 'River', 'arb', 'gamebet', 'changmen', '.smoke');
fs.mkdirSync(OUT, { recursive: true });

const PAGES = [
  { name: 'local-3560', url: 'http://127.0.0.1:3560/' },
  { name: 'vite-5174', url: 'http://127.0.0.1:5174/' },
  { name: 'prod-vps', url: 'http://47.82.100.166/' },
];

const HEALTH = [
  { name: 'health-local', url: 'http://127.0.0.1:3560/esport/health' },
  { name: 'health-prod', url: 'http://47.82.100.166/esport/health' },
];

async function fetchHealth(item) {
  try {
    const res = await fetch(item.url, { signal: AbortSignal.timeout(15000) });
    let body = '';
    try { body = (await res.text()).slice(0, 500); } catch (_) {}
    return { ...item, ok: res.ok, status: res.status, body };
  } catch (e) {
    return { ...item, ok: false, status: 0, error: String(e.message || e) };
  }
}

async function smokePage(browser, item) {
  const consoleLogs = [];
  const pageErrors = [];
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleLogs.push(`[console.error] ${msg.text()}`);
  });
  page.on('pageerror', (err) => pageErrors.push(`[pageerror] ${err.message}`));

  let httpStatus = 0;
  let title = '';
  let mountOk = false;
  let navError = null;
  const shot = path.join(OUT, `${item.name}.png`);

  try {
    const resp = await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    httpStatus = resp ? resp.status() : 0;
    await page.waitForTimeout(2000);
    title = await page.title();
    mountOk = await page.evaluate(() => {
      const app = document.querySelector('#app');
      if (app && (app.innerText || '').trim().length > 0) return true;
      const main = document.querySelector('main');
      if (main && (main.innerText || '').trim().length > 0) return true;
      const bodyText = (document.body?.innerText || '').trim();
      return bodyText.length > 50;
    });
    await page.screenshot({ path: shot, fullPage: false });
  } catch (e) {
    navError = String(e.message || e);
    try { await page.screenshot({ path: shot, fullPage: false }); } catch (_) {}
  }

  await ctx.close();
  const pass = !navError && httpStatus >= 200 && httpStatus < 400 && mountOk && consoleLogs.length === 0 && pageErrors.length === 0;
  return {
    name: item.name,
    url: item.url,
    httpStatus,
    title,
    mountOk,
    consoleLogs,
    pageErrors,
    screenshot: shot,
    navError,
    pass,
  };
}

(async () => {
  const healthResults = await Promise.all(HEALTH.map(fetchHealth));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (e) {
    console.log(JSON.stringify({ error: 'chromium_launch_failed', message: String(e), healthResults }, null, 2));
    process.exit(2);
  }
  const pageResults = [];
  for (const p of PAGES) {
    pageResults.push(await smokePage(browser, p));
  }
  await browser.close();
  console.log(JSON.stringify({ pageResults, healthResults }, null, 2));
})();
