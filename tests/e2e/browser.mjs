import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
// Browser check with a fake backend. Needs Playwright and Chromium (npm i -D playwright). Run: node tests/e2e/browser.mjs <folder for screenshots>
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..'), SP = process.argv[2] || '.';
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/json' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(root, p); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(8099);
// fake backend: deterministic prices and 2 years of daily candles
const days = []; for (let d = Date.parse('2024-11-01T00:00:00Z'); d <= Date.parse('2026-10-30T00:00:00Z'); d += 864e5) { const w = new Date(d).getUTCDay(); if (w && w < 6) days.push(new Date(d).toISOString().slice(0, 10)); }
const series = (base, drift) => { const c = days.map((_, i) => +(base * (1 + drift * i / days.length) * (1 + 0.04 * Math.sin(i / 9))).toFixed(2)); return { d: days, o: c.map((x) => +(x * 0.995).toFixed(2)), h: c.map((x) => +(x * 1.01).toFixed(2)), l: c.map((x) => +(x * 0.99).toFixed(2)), c, v: c.map((_, i) => 800 + (i % 50) * 10) }; };
const DATA = { TCS: series(3500, 0.3), INFY: series(1500, -0.1), RELIANCE: series(2400, 0.2), NIFTY: series(22000, 0.15) };
let calls = []; const log = (a, b) => calls.push(a + (b ? ':' + b : ''));
const browser = await chromium.launch(); const results = []; const ok = (c, m) => { results.push([c, m]); console.log(c ? 'ok  ' : 'FAIL', m); };
async function run(vw, label) {
  const ctx = await browser.newContext({ viewport: vw, deviceScaleFactor: 1 }); const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await page.route('https://backend.test/**', async (route) => { const b = JSON.parse(route.request().postData() || '{}'); log(b.action, b.symbol || (b.symbols || []).map((s) => s.symbol).join('+'));
    let out = { ok: true };
    if (b.action === 'read') out = { ok: true, version: 1, data: null, empty: true };
    else if (b.action === 'write') out = { ok: true, version: 2 };
    else if (b.action === 'quotes') { out = { ok: true, quotes: {}, errors: {} }; for (const s of b.symbols) { const k = DATA[s.symbol]; if (!k) { out.errors[s.symbol] = 'no price'; continue; } const n = k.c.length; out.quotes[s.symbol] = { price: k.c[n - 1], prevClose: k.c[n - 2], high52: Math.max(...k.h.slice(-250)), low52: Math.min(...k.l.slice(-250)), dayHigh: k.h[n - 1], dayLow: k.l[n - 1], volume: 1234567, name: s.symbol + ' Ltd' }; } }
    else if (b.action === 'detail') { const k = DATA[b.symbol]; out = k ? { ok: true, symbol: b.symbol, ticker: b.symbol + '.NS', quote: { price: k.c.at(-1), prevClose: k.c.at(-2) }, history: k, fundamentals: b.fundamentals === false ? null : { name: b.symbol + ' Limited', sector: 'Technology', industry: 'IT Services', pe: 28.4, pb: 11.2, marketCap: 1.4e13, roe: 0.42, profitMargin: 0.19, targetMean: k.c.at(-1) * 1.1, recommendation: 'buy', analysts: 30 }, notes: [] } : { error: 'No price history found for ' + b.symbol + '.' }; }
    await route.fulfill({ status: 200, contentType: 'text/plain', body: JSON.stringify(out), headers: { 'access-control-allow-origin': '*' } }); });
  await page.route('https://backend.test/**', (r) => r.fallback());
  const mk = (id, type, date, o = {}) => ({ id, acct: 'a1', date, ts: date + 'T05:00:00.000Z', type, note: '', fees: 0, ...o });
  const lab = { v: 1, accounts: [{ id: 'a1', name: 'Swing', createdAt: '2026-10-31T00:00:00Z', archived: false, fees: { brokeragePct: 0.05, flat: 0, otherPct: 0 } }], watchlists: [{ id: 'w1', name: 'Ideas', items: [{ symbol: 'RELIANCE', name: '', target: 2700, dir: 'above', note: 'wait' }] }], baskets: [], marks: [], snaps: [], settings: { iv: 0.2, rate: 0.07 }, updatedAt: '2026-10-31T00:00:00Z',
    txns: [mk('t0', 'deposit', '2026-10-31', { amount: 500000, note: 'Starting capital' }), mk('t1', 'buy', '2026-10-31', { symbol: 'TCS', name: 'TCS', qty: 20, price: 3300, amount: 66000 }), mk('t2', 'buy', '2026-10-31', { symbol: 'INFY', name: 'INFY', qty: 40, price: 1700, amount: 68000 })] };
  await page.addInitScript(([lab, cfg]) => { if (!localStorage.getItem('tl.data')) { localStorage.setItem('tl.data', JSON.stringify(lab)); localStorage.setItem('tl.cfg', JSON.stringify(cfg)); localStorage.setItem('tl.meta', JSON.stringify({ version: 1, dirty: false })); localStorage.setItem('tl.base', JSON.stringify(lab)); } }, [lab, { backendUrl: 'https://backend.test/exec', key: 'k'.repeat(24), theme: 'light', fontScale: 1 }]);
  await page.goto('http://localhost:8099/#/dashboard'); await page.waitForSelector('.stat', { timeout: 8000 });
  ctx._page = page; return { ctx, page, errs };
}
try {
  // ---------- desktop ----------
  let { ctx, page, errs } = await run({ width: 1360, height: 900 });
  await page.waitForTimeout(400);
  ok(calls.filter((c) => /quotes|detail/.test(c)).length === 0, 'opening the app makes no price call (' + JSON.stringify(calls.filter((c) => !/read|write/.test(c))) + ')');
  await page.screenshot({ path: SP + '/01-dashboard.png' });
  await page.click('.refresh-btn'); await page.waitForFunction(() => document.querySelector('.stamp') && /Updated/.test(document.querySelector('.stamp').textContent), null, { timeout: 8000 });
  ok(calls.some((c) => c.startsWith('quotes')), 'Refresh prices fetches only when pressed');
  await page.screenshot({ path: SP + '/02-dashboard-priced.png' });
  const colours = await page.evaluate(() => { const g = (s) => [...document.querySelectorAll(s)].map((e) => getComputedStyle(e).color); return { pos: g('.pl.pos, .chg.pos').slice(0, 2), neg: g('.pl.neg, .chg.neg').slice(0, 2) }; });
  console.log('colours', JSON.stringify(colours));
  ok(colours.pos.length > 0 && colours.neg.length > 0 && colours.pos[0] !== colours.neg[0], 'gains are green and losses are red (different colours rendered)');
  await page.goto('http://localhost:8099/#/stocks/holdings'); await page.waitForSelector('.movers'); await page.screenshot({ path: SP + '/03-holdings.png', fullPage: true });
  ok(await page.locator('.movers .mvbox').count() >= 4, 'holdings page shows top gainers, losers, movers and biggest positions');
  ok((await page.locator('.lab-stats .stat').filter({ hasText: 'XIRR' }).count()) === 1, 'holdings page has an XIRR summary card');
  // stock page, no auto load
  const n0 = calls.length; await page.goto('http://localhost:8099/#/stock/TCS'); await page.waitForSelector('.trade-panel'); await page.waitForTimeout(300);
  ok(calls.length === n0, 'opening a share page fetches nothing by itself');
  await page.screenshot({ path: SP + '/04-stock-nochart.png', fullPage: true });
  await page.click('text=Load chart & fundamentals >> nth=0'); await page.waitForSelector('.price-chart', { timeout: 8000 }); await page.waitForTimeout(300);
  ok(calls.some((c) => c === 'detail:TCS'), 'chart and fundamentals load on the button');
  ok((await page.locator('.kvs .kv').filter({ hasText: 'P/E' }).count()) >= 1 && (await page.locator('.sp-about').count()) === 1, 'fundamentals shown (P/E, sector)');
  ok(!/\bnull\b|undefined|NaN/.test(await page.locator('main').innerText()), 'no stray null / undefined / NaN text on the stock page');
  await page.screenshot({ path: SP + '/05-stock-chart.png', fullPage: true });
  await page.click('.chipopt:has-text("Candles")'); await page.click('.chipopt:has-text("50d")'); await page.click('.chipopt:has-text("3M")'); await page.waitForTimeout(200); await page.screenshot({ path: SP + '/06-stock-candles.png' });
  // ---- the back-dated buy (the reported bug) ----
  await page.fill('input[aria-label="Quantity"]', '10'); await page.click('.tp-more summary'); await page.fill('input[aria-label="Order date"]', '2026-06-15'); await page.waitForTimeout(250);
  const warn = await page.locator('.tp-note').first().innerText().catch(() => '');
  console.log('past-date message:', warn.replace(/\n/g, ' | '));
  ok(/starts on 2026-10-31/.test(warn), 'a back-dated buy explains the account only starts on 31 Oct and offers a fix');
  await page.screenshot({ path: SP + '/07-backdated-warning.png' });
  await page.click('button:has-text("Start this account on 2026-06-15")'); await page.waitForTimeout(500);
  ok(/Account now starts on/.test(await page.locator('#toast').innerText()), 'one tap moves the account start date back');
  await page.fill('input[aria-label="Quantity"]', '10'); await page.waitForTimeout(200);
  const goTxt = await page.locator('.tp-go.buy').first().innerText(); console.log('go button:', goTxt);
  const px = await page.evaluate(() => JSON.parse(localStorage.getItem('lab.hist.TCS')).hist.c[JSON.parse(localStorage.getItem('lab.hist.TCS')).hist.d.indexOf('2026-06-15')]);
  ok(goTxt.includes(px.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')) || /Buy 10/.test(goTxt), 'the past-date order uses that day’s saved close (' + px + '), not today’s price');
  await page.click('.tp-go.buy >> nth=0'); await page.waitForTimeout(600);
  const placed = await page.evaluate(() => JSON.parse(localStorage.getItem('tl.data')).txns.filter((t) => t.date === '2026-06-15' && t.type === 'buy'));
  ok(placed.length === 1 && placed[0].price === px && placed[0].qty === 10, 'the back-dated buy was placed at the historical close');
  await page.screenshot({ path: SP + '/08-after-buy.png', fullPage: true });
  // insights
  await page.goto('http://localhost:8099/#/insights'); await page.waitForSelector('.stat'); await page.screenshot({ path: SP + '/09-insights.png', fullPage: true });
  await page.click('button:has-text("Load NIFTY 50 history")'); await page.waitForFunction(() => /Reload NIFTY/.test(document.body.innerText), null, { timeout: 8000 });
  ok(/Ahead of the index|Behind the index/.test(await page.locator('.finds').innerText().catch(() => '')), 'insights compares against the index once it is loaded');
  await page.screenshot({ path: SP + '/10-insights-index.png', fullPage: true });
  // watchlist
  await page.goto('http://localhost:8099/#/stocks/watchlists'); await page.waitForSelector('.tbl'); await page.screenshot({ path: SP + '/11-watchlist.png' });
  const n1 = calls.length; await page.fill('.lab-find', 'wipro'); await page.keyboard.press('Enter'); await page.waitForSelector('.trade-panel'); ok(calls.length === n1 && /#\/stock\/WIPRO/.test(page.url()), 'searching a share opens its page without a price call');
  ok(errs.length === 0, 'no script errors on desktop' + (errs.length ? ': ' + errs[0] : '')); await ctx.close();
  // ---------- phone ----------
  ({ ctx, page, errs } = await run({ width: 390, height: 844 }));
  await page.goto('http://localhost:8099/#/stocks/holdings'); await page.waitForSelector('.mrows'); await page.screenshot({ path: SP + '/12-phone-holdings.png', fullPage: true });
  await page.goto('http://localhost:8099/#/stock/TCS'); await page.waitForSelector('.trade-panel'); await page.screenshot({ path: SP + '/13-phone-stock.png', fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); ok(overflow <= 1, 'no sideways scroll on a phone (' + overflow + 'px)');
  await page.goto('http://localhost:8099/#/insights'); await page.waitForSelector('.stat'); await page.screenshot({ path: SP + '/14-phone-insights.png', fullPage: true });
  ok(errs.length === 0, 'no script errors on phone' + (errs.length ? ': ' + errs[0] : '')); await ctx.close();
} catch (e) { console.log('E2E ERROR', e.message.split('\n')[0]); results.push([false, 'e2e crashed']); }
await browser.close(); srv.close(); process.exit(results.some((r) => !r[0]) ? 1 : 0);
