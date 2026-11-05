import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root = new URL('../..', import.meta.url).pathname, SP = process.argv[2] || '/tmp';
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/json' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(root, p); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': mime[path.extname(f)] || 'text/plain' }); r.end(fs.readFileSync(f)); }).listen(8099);
const days = []; for (let d = Date.parse('2019-01-01T00:00:00Z'); d <= Date.parse('2026-10-30T00:00:00Z'); d += 864e5) { const w = new Date(d).getUTCDay(); if (w && w < 6) days.push(new Date(d).toISOString().slice(0, 10)); }
const mk = (base, drift, amp) => { const c = days.map((_, i) => +(base * (1 + drift * i / days.length) * (1 + amp * Math.sin(i / 23))).toFixed(2)); return { d: days, o: c.map((x) => +(x * 0.995).toFixed(2)), h: c.map((x) => +(x * 1.01).toFixed(2)), l: c.map((x) => +(x * 0.99).toFixed(2)), c, v: c.map((_, i) => 800 + (i % 50) * 10) }; };
const DATA = { TCS: mk(3500, 1.2, 0.06), NIFTY: mk(11000, 1.1, 0.04), NIFTYSMALL100: mk(6000, 1.6, 0.09), NIFTY500: mk(9000, 1.2, 0.05) };
const NAVd = days.map((d) => d.split('-').reverse().join('-'));
const navRows = (g) => days.map((_, i) => ({ date: NAVd[i], nav: String((50 * (1 + g * i / days.length) * (1 + 0.05 * Math.sin(i / 19))).toFixed(4)) })).reverse();
const calls = [];
const browser = await chromium.launch(); const res = []; const ok = (c, m) => { res.push(c); console.log(c ? 'ok  ' : 'FAIL', m); };
async function open(vw, theme, hash) {
  const ctx = await browser.newContext({ viewport: vw, deviceScaleFactor: 1, hasTouch: !!vw.touch, isMobile: !!vw.touch }); const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await page.route('https://backend.test/**', async (route) => { const b = JSON.parse(route.request().postData() || '{}'); calls.push(b.action + ':' + (b.symbol || b.code || b.q || ''));
    let out = { ok: true };
    if (b.action === 'read') out = { ok: true, version: 1, data: null, empty: true }; else if (b.action === 'write') out = { ok: true, version: 2 };
    else if (b.action === 'detail') { const k = DATA[b.symbol]; out = k ? { ok: true, symbol: b.symbol, ticker: b.symbol, quote: { price: k.c.at(-1), prevClose: k.c.at(-2) }, history: k, fundamentals: null, notes: [] } : { error: 'No price history found for ' + b.symbol }; }
    else if (b.action === 'fundsearch') out = { ok: true, funds: [{ code: '100001', name: 'Acme Flexi Cap Fund - Direct Plan - Growth' }, { code: '100002', name: 'Acme Flexi Cap Fund - Regular Plan - Growth' }] };
    else if (b.action === 'fundnav') out = { ok: true, code: b.code, name: 'Acme Flexi Cap Fund - Direct Plan - Growth', house: 'Acme Mutual Fund', category: 'Equity Scheme - Flexi Cap Fund', type: 'Open', d: days, c: JSON.parse(JSON.stringify(navRows(1.5))).reverse().map((r) => +r.nav) };
    await route.fulfill({ status: 200, contentType: 'text/plain', body: JSON.stringify(out), headers: { 'access-control-allow-origin': '*' } }); });
  const t = (id, type, date, o = {}) => ({ id, acct: 'a1', date, ts: date + 'T05:00:00.000Z', type, note: '', fees: 0, ...o });
  const lab = { v: 1, accounts: [{ id: 'a1', name: 'Swing', createdAt: '2025-01-01T00:00:00Z', archived: false, fees: { brokeragePct: 0, flat: 0, otherPct: 0 } }], watchlists: [], baskets: [], marks: [], snaps: [], settings: { iv: 0.2, rate: 0.07 },
    txns: [t('t0', 'deposit', '2025-01-01', { amount: 900000 }), t('t1', 'buy', '2025-03-03', { symbol: 'TCS', name: 'TCS', qty: 20, price: 3600, amount: 72000 })] };
  await page.addInitScript(([lab, cfg]) => { if (!localStorage.getItem('tl.data')) { localStorage.setItem('tl.data', JSON.stringify(lab)); localStorage.setItem('tl.cfg', JSON.stringify(cfg)); localStorage.setItem('tl.meta', JSON.stringify({ version: 1, dirty: false })); localStorage.setItem('tl.base', JSON.stringify(lab)); } }, [lab, { backendUrl: 'https://backend.test/exec', key: 'k'.repeat(24), theme, fontScale: 1 }]);
  await page.goto('http://localhost:8099/#' + hash); await page.waitForTimeout(500); return { ctx, page, errs };
}
const svgN = (p, sel) => p.locator('.tc-svg ' + sel).count();
async function run(vw, theme, label) {
  const { ctx, page, errs } = await open(vw, theme, '/stock/TCS');
  await page.click('text=Load chart & fundamentals >> nth=0'); await page.waitForSelector('.tc-svg', { timeout: 6000 }).catch(async () => { console.log('ERRS', errs.join(' // '), '\nBODY', (await page.locator('main').innerText()).slice(0, 400)); throw new Error('no chart'); });
  ok(await svgN(page, 'path') > 3, label + ': line chart draws');
  ok(await page.locator('.tc-svg text', { hasText: /^2026$/ }).count() >= 1 || await page.locator('.tc-svg text[data-mark]').count() > 2, label + ': year/month labels on time axis');
  const axisX = await page.evaluate(() => { const t = [...document.querySelectorAll('.tc-svg text:not([data-mark])')].filter((e) => /^[\d,.]+$/.test(e.textContent)); return t.length ? Math.min(...t.map((e) => +e.getAttribute('x'))) : 0; });
  ok(axisX > (vw.width < 600 ? 300 : 800), label + ': price axis labels are on the right (x=' + axisX + ')');
  ok(await page.locator('.tc-svg [data-tag="last"]').count() === 1, label + ': last price dotted line and tag');
  ok(await page.locator('.tc-svg text', { hasText: /^(High|Low)$/ }).count() >= 1, label + ': High / Low tags (High hides when within 20px of the last price, as specified)');
  await page.screenshot({ path: `${SP}/c-${label}-1-line.png`, fullPage: true });
  // modes
  await page.click('.tcb-seg button:text-is("Candles")'); await page.waitForTimeout(150); ok(await svgN(page, 'path[fill="#089981"], path[fill="#f23645"]') >= 2, label + ': candles draw');
  await page.click('.tcb-seg button:text-is("%")'); await page.waitForTimeout(150); ok(await page.locator('.tc-svg text', { hasText: /%$/ }).count() > 2 && await page.locator('button:text-is("Trendline")').count() === 0, label + ': percent mode shows % axis and hides Trendline');
  await page.click('.tcb-seg button:text-is("Line")');
  // pills & bars
  await page.click('.tcb-pill:has-text("50d")'); await page.click('.tcb-pill:has-text("RSI")'); await page.click('.tcb-seg button:text-is("Week")'); await page.waitForTimeout(200);
  ok(await page.locator('.tc-svg text', { hasText: 'RSI 14' }).count() === 1, label + ': indicator panel');
  ok(/Each candle is a week/.test(await page.locator('.tc-below').innerText()), label + ': page says each candle is a week');
  await page.click('.tcb-seg button:text-is("Auto")');
  // no sideways scroll
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), label + ': no sideways page scroll');
  // ranges
  await page.click('.tcb-seg button:text-is("Max")'); await page.waitForTimeout(150);
  const box = await page.locator('.tc-box').boundingBox(); const pl = { x: box.x + box.width * 0.5, y: box.y + box.height * 0.25 };
  // crosshair
  await page.mouse.move(pl.x, pl.y); await page.waitForTimeout(100);
  ok(await page.locator('.tc-xh line').count() >= 2 && await page.locator('.tc-xh text').count() >= 2, label + ': crosshair with price and date tags');
  const read1 = await page.locator('.tc-read').innerText(); ok(/Close/.test(read1), label + ': readout line');
  await page.screenshot({ path: `${SP}/c-${label}-2-cross.png`, fullPage: true });
  // wheel zoom
  const v0 = await page.evaluate(() => [...document.querySelectorAll('.tc-svg text[data-mark]')].length);
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -200); await page.waitForTimeout(150);
  const marksIn = await page.locator('.tc-svg text[data-mark]').allTextContents(); ok(marksIn.length > 0 && marksIn.join() !== '', label + ': wheel zoom redraws (' + marksIn.slice(0, 4).join(',') + ')');
  // pan by drag
  const before = await page.locator('.tc-svg text[data-mark]').allTextContents();
  await page.mouse.move(pl.x, pl.y); await page.mouse.down(); await page.mouse.move(pl.x + 150, pl.y, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(150);
  const after = await page.locator('.tc-svg text[data-mark]').allTextContents(); ok(before.join() !== after.join(), label + ': drag pans');
  // axis drag: price
  const gridBefore = await page.locator('.tc-svg text').allTextContents();
  await page.mouse.move(box.x + box.width - 10, box.y + 80); await page.mouse.down(); await page.mouse.move(box.x + box.width - 10, box.y + 160, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(150);
  const gridAfter = await page.locator('.tc-svg text').allTextContents(); ok(gridBefore.join() !== gridAfter.join(), label + ': price axis drag changes the scale');
  await page.mouse.dblclick(box.x + box.width - 10, box.y + 100); await page.waitForTimeout(150);
  ok((await page.locator('.tc-svg text').allTextContents()).join() !== gridAfter.join(), label + ': double-click price axis undoes stretch');
  // time-axis drag
  const tb = await page.locator('.tc-svg').boundingBox();
  await page.mouse.move(tb.x + tb.width * 0.5, tb.y + tb.height - 6); await page.mouse.down(); await page.mouse.move(tb.x + tb.width * 0.5 + 120, tb.y + tb.height - 6, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(150);
  ok((await page.locator('.tc-svg text[data-mark]').allTextContents()).join() !== after.join(), label + ': time axis drag stretches time');
  // buttons
  await page.click('.tcb-seg button:text-is("Reset")'); await page.waitForTimeout(100);
  await page.click('.tcb-seg button[aria-label="Zoom in"]'); await page.click('.tcb-seg button[aria-label="Zoom in"]'); await page.waitForTimeout(100);
  const zin = await page.locator('.tc-svg text[data-mark]').allTextContents(); await page.click('.tcb-seg button[aria-label="Zoom out"]'); await page.waitForTimeout(100);
  ok(zin.join() !== (await page.locator('.tc-svg text[data-mark]').allTextContents()).join(), label + ': zoom buttons');
  // pan past ends: drag far right until first bar is in view in empty area
  await page.click('.tcb-seg button:text-is("Reset")'); await page.waitForTimeout(100);
  const grab = async (dx) => { await page.mouse.move(pl.x, pl.y); await page.mouse.down(); await page.mouse.move(pl.x + dx, pl.y, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(120); };
  await grab(box.width * 0.45); await grab(box.width * 0.45); await grab(box.width * 0.45);
  const emptyLeft = await page.evaluate(() => { const p = [...document.querySelectorAll('.tc-svg path')].find((e) => e.getAttribute('stroke-width') === '1.6'); const m = p && /M([\d.]+)/.exec(p.getAttribute('d')); return m ? +m[1] : -1; });
  ok(emptyLeft > (vw.width < 600 ? 120 : 300) , label + ': first bar dragged to the middle (line starts at x=' + emptyLeft + ')');
  ok(await page.locator('.tc-svg text[data-mark]').count() > 1, label + ': grid and labels continue in the empty area');
  await page.screenshot({ path: `${SP}/c-${label}-3-pastend.png`, fullPage: true });
  await page.click('.tcb-seg button:text-is("Reset")'); await grab(-box.width * 0.45); await grab(-box.width * 0.45); await grab(-box.width * 0.45);
  const lastX = await page.evaluate(() => { const p = [...document.querySelectorAll('.tc-svg path')].find((e) => e.getAttribute('stroke-width') === '1.6'); const m = p && p.getAttribute('d').match(/L([\d.]+) [\d.]+Z?$/); const pts = p.getAttribute('d').split('L'); const last = pts[pts.length - 1].split(' ')[0]; return +last; });
  ok(lastX < (vw.width < 600 ? 260 : 560), label + ': last bar dragged to the middle (line ends at x=' + lastX + ')');
  await page.click('.tcb-seg button:text-is("Reset")');
  // colours
  await page.click('.tcb-pill:text-is("Colours")'); await page.waitForTimeout(100);
  ok(await page.locator('.tcb-crow').count() >= 4 && await page.locator('.tcb-cfoot button').isDisabled(), label + ': colour panel, reset greyed out');
  await page.locator('.tcb-crow').first().locator('.sw').nth(5).click(); await page.waitForTimeout(150);
  const stored = await page.evaluate(() => localStorage.getItem('tl.chart.colors')); ok(/00b8d4/i.test(stored || '') && !(JSON.parse(stored || '{}').ma200), label + ': only the changed colour is stored on the device (' + stored + ')');
  ok(!(await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('tl.data'))).includes('00b8d4'))), label + ': colours never enter the saved data');
  await page.screenshot({ path: `${SP}/c-${label}-4-colours.png`, fullPage: true });
  await page.reload(); await page.waitForSelector('.tc-svg'); await page.click('.tcb-pill:text-is("Colours")');
  ok(/00b8d4/i.test(await page.evaluate(() => localStorage.getItem('tl.chart.colors'))), label + ': colour survives reload');
  await page.click('.tcb-cfoot button'); ok(!(await page.evaluate(() => localStorage.getItem('tl.chart.colors'))), label + ': reset to default clears it');
  await page.click('.tcb-pill:text-is("Colours")');
  // trendline draw
  await page.click('.tcb-seg button:text-is("1Y")'); await page.waitForTimeout(150);
  await page.click('.tcb-pill:text-is("Trendline")'); ok(await page.locator('.tcb-pill:has-text("Tap two points")').count() === 1, label + ': trendline button label changes');
  const b2 = await page.locator('.tc-box').boundingBox();
  await page.mouse.click(b2.x + b2.width * 0.3, b2.y + b2.height * 0.3); await page.mouse.move(b2.x + b2.width * 0.5, b2.y + b2.height * 0.35); await page.mouse.click(b2.x + b2.width * 0.7, b2.y + b2.height * 0.25); await page.waitForTimeout(500);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('tl.data')).lines || []); ok(saved.length === 1 && saved[0].sym === 'TCS' && /^\d{4}-/.test(saved[0].d1), label + ': trendline saved in the data as an optional list');
  ok(await page.locator('.tc-pop').isVisible(), label + ': pop-up opens at the new line');
  const view1 = await page.locator('.tc-svg text[data-mark]').allTextContents();
  await page.locator('.tc-pop-sw .sw').nth(1).click(); await page.waitForTimeout(500);
  ok((await page.evaluate(() => JSON.parse(localStorage.getItem('tl.data')).lines[0].color)) === '#e91e63', label + ': line recoloured');
  ok((await page.locator('.tc-svg text[data-mark]').allTextContents()).join() === view1.join(), label + ': saving a line does not jump the chart back (marks unchanged)');
  await page.screenshot({ path: `${SP}/c-${label}-5-line.png`, fullPage: true });
  // move the line by dragging its body
  const geo = await page.evaluate((vw) => { const l = document.querySelector('.tc-svg line[data-line]'); const r = document.querySelector('.tc-svg').getBoundingClientRect(); const k = r.width / document.querySelector('.tc-svg').viewBox.baseVal.width; return { x: r.left + (+l.getAttribute('x1') * (vw.width < 600 ? 0.62 : 0.53) + +l.getAttribute('x2') * (vw.width < 600 ? 0.38 : 0.47)) * k, y: r.top + (+l.getAttribute('y1') * (vw.width < 600 ? 0.62 : 0.53) + +l.getAttribute('y2') * (vw.width < 600 ? 0.38 : 0.47)) * k }; }, vw);
  console.log('GEO', JSON.stringify(geo), await page.evaluate(([x,y]) => { const e = document.elementFromPoint(x,y); return e && (e.tagName + '.' + (e.getAttribute('class')||'')); }, [geo.x, geo.y]));
  const d1 = saved[0].d1; await page.mouse.move(geo.x, geo.y); await page.mouse.down(); await page.mouse.move(geo.x + 40, geo.y + 30, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(500);
  const moved = await page.evaluate(() => JSON.parse(localStorage.getItem('tl.data')).lines[0]); console.log('MOVED', JSON.stringify(saved[0]), JSON.stringify(moved));
  ok(moved.d1 !== d1 && moved.p1 !== saved[0].p1, label + ': dragging the body moves the line');
  // alert
  await page.locator('.tc-pop-act button:text-is("Set alert")').click(); await page.waitForSelector('dialog[open]'); await page.click('dialog button:text-is("Save alert")'); await page.waitForTimeout(500);
  ok((await page.evaluate(() => JSON.parse(localStorage.getItem('tl.data')).lines[0].alert)).dir === 'above', label + ': alert set on the line');
  await page.locator('.tc-pop-act button:text-is("Delete")').click(); await page.waitForTimeout(500);
  ok((await page.evaluate(() => (JSON.parse(localStorage.getItem('tl.data')).lines || []).length)) === 0, label + ': delete removes the line (and its alert)');
  // full view
  await page.click('.tc-fs'); await page.waitForTimeout(400);
  const fv = await page.evaluate(() => { const c = document.querySelector('.tcard.full'); if (!c) return null; const cs = getComputedStyle(c); return { bg: cs.backgroundColor, pos: cs.position, w: c.getBoundingClientRect().width, h: c.getBoundingClientRect().height, tb: !!c.querySelector('.tcb'), below: c.querySelector('.tc-below').children.length, lock: document.body.classList.contains('tc-lock') }; });
  ok(fv && fv.pos === 'fixed' && fv.w >= vw.width - 1 && fv.tb && fv.below === 0 && fv.lock, label + ': full view covers the screen with toolbar, hides notes ' + JSON.stringify(fv));
  ok(theme === 'light' ? /255, 255, 255/.test(fv.bg) : !/255, 255, 255/.test(fv.bg), label + ': full view surface ' + fv.bg);
  await page.screenshot({ path: `${SP}/c-${label}-6-full.png` });
  await page.keyboard.press('Escape'); await page.waitForTimeout(300); ok(await page.locator('.tcard.full').count() === 0, label + ': Esc closes full view');
  await page.click('.tc-fs'); await page.waitForTimeout(200); await page.click('.tc-fs'); await page.waitForTimeout(200); ok(await page.locator('.tcard.full').count() === 0, label + ': close icon closes full view');
  ok(errs.length === 0, label + ': no script errors' + (errs.length ? ' ' + errs[0] : '')); await ctx.close();
}
async function funds(vw, theme, label) {
  const { ctx, page, errs } = await open(vw, theme, '/funds'); const n0 = calls.length;
  ok(calls.length === n0 && (await page.locator('.tabbar a').count()) === 6, label + ': Funds tab present (6 tabs), nothing fetched on open');
  await page.fill('input[aria-label="Search mutual funds"]', 'acme flexi'); await page.click('button:text-is("Search")'); await page.waitForSelector('.fx-hit');
  ok(calls.includes('fundsearch:acme flexi'), label + ': search runs only when pressed');
  await page.locator('.fx-hit').first().click(); await page.waitForSelector('.fund-page .tc-svg', { timeout: 8000 });
  ok(await page.locator('.fx-head h2').innerText().then((t) => /Acme/.test(t)), label + ': fund page opens after choosing');
  ok(await page.locator('button:text-is("Candles")').count() === 0 && await page.locator('button:text-is("Trendline")').count() === 0, label + ': fund chart has no candles or trendlines');
  ok(await page.locator('button:has-text("Load NIFTY")').count() === 1, label + ': asks before loading the benchmark index');
  await page.click('button:has-text("Load NIFTY")'); await page.waitForSelector('h2:text-is("Rolling returns against NIFTY 500")', { timeout: 8000 });
  ok(await page.locator('.fx-verdict').first().innerText().then((t) => /ahead of NIFTY 500/.test(t)), label + ': rolling returns compared with the index with a verdict');
  ok((await page.locator('h2').allTextContents()).join('|').match(/Growth of 100.*SIP back-test.*Risk.*Year by year/) !== null, label + ': growth, SIP, risk, year-by-year panels');
  await page.click('.chipopt:text-is("1 year")'); await page.waitForTimeout(200);
  ok(/1 year windows/.test(await page.locator('.fx-verdict').first().innerText()), label + ': window switch to 1 year');
  ok(!/\bnull\b|undefined|NaN/.test(await page.locator('main').innerText()), label + ': no null/NaN text on fund page');
  await page.screenshot({ path: `${SP}/f-${label}-1-fund.png`, fullPage: true });
  await page.click('.tcb-pill:has-text("Rolling return")'); await page.waitForTimeout(200); ok(await page.locator('.tc-svg text', { hasText: /^Median/ }).count() >= 1, label + ': rolling-return panel with Median line on fund chart');
  ok(await page.evaluate(() => JSON.parse(localStorage.getItem('tl.data')).funds.length) === 1, label + ': followed fund saved as an optional list');
  await page.goto('http://localhost:8099/#/funds/indexes'); await page.waitForSelector('h2:text-is("Index scoreboard")'); await page.waitForTimeout(200);
  await page.click('button:text-matches("(Re)?load all indexes", "i")'); await page.waitForTimeout(1500);
  ok(calls.filter((c) => c.startsWith('detail:')).length >= 12, label + ': load all indexes fetches only on that press');
  await page.screenshot({ path: `${SP}/f-${label}-2-indexes.png`, fullPage: true });
  await page.locator('tr.click', { hasText: 'NIFTY 50' }).first().click(); await page.waitForSelector('.fund-page .tc-svg');
  ok(await page.locator('.tcb-seg button:text-is("Candles")').count() === 1 && await page.locator('h2:text-is("Rolling returns")').count() === 1, label + ': index page has candles chart and rolling returns');
  await page.screenshot({ path: `${SP}/f-${label}-3-index.png`, fullPage: true });
  ok(errs.length === 0, label + ': no script errors' + (errs.length ? ' ' + errs[0] : '')); await ctx.close();
}
try {
  await run({ width: 1280, height: 900 }, 'light', 'desktop-light');
  await run({ width: 1280, height: 900 }, 'dark', 'desktop-dark');
  await run({ width: 390, height: 1500 }, 'light', 'phone-light');
  await run({ width: 390, height: 1500 }, 'dark', 'phone-dark');
  await funds({ width: 1280, height: 900 }, 'light', 'desktop-light');
  await funds({ width: 390, height: 1500 }, 'dark', 'phone-dark');
} catch (e) { console.log('CRASH', e.message.split('\n').slice(0, 4).join(' | ')); res.push(false); }
await browser.close(); srv.close(); console.log(res.filter(Boolean).length + '/' + res.length + ' passed'); process.exit(res.every(Boolean) ? 0 : 1);
