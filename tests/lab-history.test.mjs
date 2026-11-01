// Price history cache and lookups. node tests/lab-history.test.mjs  (stands in for localStorage and the backend)
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } else console.log('ok  ', m); };
const store = new Map(); let quota = Infinity;
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { const size = [...store].reduce((a, [kk, vv]) => a + (kk === k ? 0 : vv.length), 0) + v.length; if (size > quota) throw new Error('quota'); store.set(k, String(v)); }, removeItem: (k) => store.delete(k) };
let fetched = 0, reply;
globalThis.fetch = async (url, opts) => { fetched++; return { ok: true, status: 200, json: async () => reply(JSON.parse(opts.body)), text: async () => JSON.stringify(reply(JSON.parse(opts.body))) }; };
const { S } = await import('../js/store.js');
const H = await import('../js/lab/history.js');
S.remote = true; S.cfg.backendUrl = 'https://example.test/exec'; S.cfg.key = 'k'.repeat(20);
const hist = (n, start = 100) => { const d = [], c = []; for (let i = 0; i < n; i++) { d.push(new Date(Date.parse('2026-01-01T00:00:00Z') + i * 864e5).toISOString().slice(0, 10)); c.push(start + i); } return { d, o: c, h: c, l: c, c, v: c.map(() => 1) }; };
reply = (b) => ({ ok: true, symbol: b.symbol, ticker: b.symbol + '.NS', quote: { price: 150 }, history: hist(60), fundamentals: b.fundamentals ? { pe: 20 } : null, notes: [] });
ok(!H.hasHistory('TCS') && H.dataOf('TCS') === null, 'nothing is saved or fetched until asked');
ok(fetched === 0, 'no network call was made on import or lookup');
const rec = await H.load('tcs');
ok(fetched === 1 && rec.symbol === 'TCS' && H.hasHistory('TCS') && H.dataOf('tcs').fund.pe === 20, 'one call brings history and company figures, saved under the upper-case symbol');
ok(H.closeOn('TCS', '2026-01-10') === 109 && H.closeOn('TCS', '2025-12-31') === null && H.closeOn('TCS', '2027-01-01') === 159, 'close on a date: exact day, before the first candle (none), after the last (last close)');
ok(H.candleOn('TCS', '2026-01-10').c === 109 && H.candleOn('TCS', '2026-03-31') === null, 'candle for an exact day only');
const sl = H.slice(rec.hist, '1M', '2026-03-01'); ok(sl.d[0] >= '2026-01-29' && sl.d.length < 40 && sl.d.at(-1) === rec.hist.d.at(-1), 'a one-month slice');
ok(H.sma([1, 2, 3, 4], 2).join() === ',1.5,2.5,3.5', 'moving average');
ok(Math.abs(H.returnOver('TCS', 30, '2026-03-01') - (159 / 129 - 1)) < 1e-9, 'return over the last 30 days');
reply = (b) => ({ ok: true, symbol: b.symbol, ticker: b.symbol, quote: {}, history: hist(60), fundamentals: null, notes: ['Yahoo did not give company figures'] });
const again = await H.load('TCS', { fundamentals: false });
ok(again.fund && again.fund.pe === 20, 'a reply without company figures keeps the ones already saved');
reply = () => ({ error: 'No price history found for ZZZ.' });
let msg = ''; try { await H.load('ZZZ'); } catch (e) { msg = e.message; } ok(/No price history/.test(msg) && !H.hasHistory('ZZZ'), 'an error from the backend is passed on and nothing is saved');
// keeps at most 40 shares, dropping the oldest
reply = (b) => ({ ok: true, symbol: b.symbol, history: hist(30), fundamentals: null, quote: {}, notes: [] });
for (let i = 0; i < 45; i++) await H.load('S' + i, { fundamentals: false });
ok(!H.hasHistory('S0') && H.hasHistory('S44'), 'only the latest 40 shares are kept');
// storage full: the oldest are dropped to make room
quota = [...store].reduce((a, [, v]) => a + v.length, 0) + 100; reply = (b) => ({ ok: true, symbol: b.symbol, history: hist(30), fundamentals: null, quote: {}, notes: [] });
const r2 = await H.load('NEWONE', { fundamentals: false }); ok(r2 && H.hasHistory('NEWONE'), 'when storage is nearly full the oldest saved share makes room');
S.remote = false; let m2 = ''; try { await H.load('TCS'); } catch (e) { m2 = e.message; } ok(/backend/.test(m2), 'without the backend it explains what is needed');
console.log(bad ? bad + ' failed' : 'all passed'); process.exit(bad ? 1 : 0);
