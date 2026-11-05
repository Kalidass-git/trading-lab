// The Apps Script backend, run in Node with stand-ins for Google's services and canned Yahoo replies. node tests/backend.test.mjs
// This checks our parsing and call flow. It does not talk to Yahoo, so it cannot prove Yahoo still answers in this shape.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } else console.log('ok  ', m); };
const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'backend', 'Code.gs'), 'utf8');
const sec = (iso) => Math.floor(Date.parse(iso) / 1000);
const days = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30'].map((d) => sec(d + 'T04:30:00Z'));   // 10:00 IST
const chart = (price, extra = {}) => ({ chart: { result: [{ meta: { regularMarketPrice: price, chartPreviousClose: 90, fiftyTwoWeekHigh: 130, fiftyTwoWeekLow: 80, regularMarketDayHigh: 112, regularMarketDayLow: 98, regularMarketVolume: 1234567, longName: 'Acme Ltd', exchangeName: 'NSI', currency: 'INR', regularMarketTime: days[4], ...extra },
  timestamp: days, indicators: { quote: [{ open: [100, 101, null, 103, 104], high: [102, 103, null, 105, 106], low: [99, 100, null, 102, 103], close: [101, 102, null, 104, 105], volume: [1000, 2000, null, 3000, 4000] }] } }] } });
const summary = { quoteSummary: { result: [{ price: { longName: 'Acme Ltd', marketCap: { raw: 5e11 } }, summaryDetail: { trailingPE: { raw: 21.5 }, dividendYield: { raw: 0.012 }, beta: { raw: 0.9 }, averageVolume: { raw: 900000 } },
  defaultKeyStatistics: { priceToBook: { raw: 3.2 }, trailingEps: { raw: 48.1 } }, financialData: { returnOnEquity: { raw: 0.18 }, profitMargins: { raw: 0.12 }, debtToEquity: { raw: 35 }, targetMeanPrice: { raw: 120 }, recommendationKey: 'buy', numberOfAnalystOpinions: { raw: 20 } }, assetProfile: { sector: 'Industrials', industry: 'Machinery', longBusinessSummary: 'x'.repeat(900) } }] } };
function load(handler) {
  const calls = [], store = {};
  const resp = (code, body, headers = {}) => ({ getResponseCode: () => code, getContentText: () => (typeof body === 'string' ? body : JSON.stringify(body)), getAllHeaders: () => headers });
  const ctx = { console, JSON, Math, Date, Array, Object, String, Number, encodeURIComponent, Error, RegExp, isNaN,
    UrlFetchApp: { fetch: (u, o) => { const url = typeof u === 'string' ? u : u.url; calls.push(url); return handler(url, o, resp); }, fetchAll: (rs) => rs.map((r) => ctx.UrlFetchApp.fetch(r.url || r, r)) },
    CacheService: { getScriptCache: () => ({ get: (k) => store[k] || null, put: (k, v) => { store[k] = v; }, remove: (k) => { delete store[k]; } }) },
    Utilities: { formatDate: (d) => new Date(d.getTime() + 5.5 * 36e5).toISOString().slice(0, 10) }, ContentService: {}, PropertiesService: {}, LockService: {}, DriveApp: {}, MimeType: {} };
  vm.createContext(ctx); vm.runInContext(src, ctx);
  return { ctx, calls, store };
}
// quotes: now carry day range, volume and name as well as the price
{
  const { ctx } = load((u, o, r) => (u.includes('INFY.NS') ? r(200, chart(110)) : r(404, '')));
  const q = ctx.quotes_([{ symbol: 'INFY', yahoo: '' }, { symbol: 'NOPE', yahoo: '' }]);
  ok(q.quotes.INFY.price === 110 && q.quotes.INFY.high52 === 130 && q.quotes.INFY.dayLow === 98 && q.quotes.INFY.volume === 1234567 && q.quotes.INFY.name === 'Acme Ltd', 'quotes: price, 52-week and day range, volume and name');
  ok(q.errors.NOPE && !q.quotes.NOPE, 'quotes: a share with no price is reported as an error, not dropped silently');
}
// detail: history + quote + fundamentals in one call
{
  const { ctx, calls, store } = load((u, o, r) => {
    if (u.includes('fc.yahoo.com')) return r(404, '', { 'Set-Cookie': ['A3=abc; Path=/; Domain=.yahoo.com', 'B=xyz; Path=/'] });
    if (u.includes('getcrumb')) return r(200, 'CRUMB123');
    if (u.includes('quoteSummary')) return r(200, summary);
    if (u.includes('ACME.NS')) return r(200, chart(105));
    return r(404, '');
  });
  const d = ctx.detail_({ symbol: 'acme', range: '5y' });
  ok(d.ok && d.ticker === 'ACME.NS' && d.history.c.length === 4 && d.history.d[0] === '2026-10-26' && d.history.v[1] === 2, 'detail: history keeps trading days only (the empty holiday row is dropped) with volume in thousands');
  ok(d.quote.prevClose === 104 && d.quote.price === 105, 'detail: previous close is the day before the last candle, not the chart’s own pre-range close');
  ok(d.fundamentals && d.fundamentals.pe === 21.5 && d.fundamentals.pb === 3.2 && d.fundamentals.roe === 0.18 && d.fundamentals.sector === 'Industrials' && d.fundamentals.about.length === 600 && d.fundamentals.marketCap === 5e11, 'detail: company figures read from Yahoo’s {raw} values');
  ok(calls.some((u) => /crumb=CRUMB123/.test(u)) && store['yf-crumb'], 'detail: the cookie and crumb are fetched and kept for later calls');
  const n = calls.length; ctx.detail_({ symbol: 'acme' });
  ok(calls.slice(n).filter((u) => /getcrumb|fc\.yahoo/.test(u)).length === 0, 'detail: a second call reuses the saved crumb');
}
// detail: company figures fail on their own; the price history is still returned
{
  const { ctx } = load((u, o, r) => (u.includes('fc.yahoo.com') ? r(500, '') : u.includes('%5ENSEI') ? r(200, chart(25000)) : r(404, '')));
  const d = ctx.detail_({ symbol: 'NIFTY', yahoo: '^NSEI', range: '5y' });
  ok(d.ok && d.history.c.length === 4 && d.fundamentals === null && d.notes.length === 1, 'detail: if Yahoo withholds company figures the chart still comes back, with a note');
  const none = load((u, o, r) => r(404, '')).ctx.detail_({ symbol: 'ZZZ' });
  ok(/No price history found/.test(none.error), 'detail: an unknown share gives a plain error');
  ok(load(() => null).ctx.detail_({ symbol: '' }).error === 'No symbol given.', 'detail: a missing symbol is refused');
}
// funds: search and NAV history from canned mfapi.in-shaped replies (the real service's shape is assumed from its public docs, not checked from here)
{
  const nav = { meta: { fund_house: 'Acme Mutual Fund', scheme_type: 'Open Ended Schemes', scheme_category: 'Equity Scheme - Flexi Cap Fund', scheme_code: 100001, scheme_name: 'Acme Flexi Cap Fund - Direct Plan - Growth' },
    data: [{ date: '03-11-2026', nav: '151.2345' }, { date: '02-11-2026', nav: '150.5' }, { date: '31-10-2026', nav: 'bad' }, { date: '30-10-2026', nav: '149.9' }], status: 'SUCCESS' };
  const { ctx, calls } = load((u, o, r) => (u.includes('/mf/search') ? r(200, [{ schemeCode: 100001, schemeName: 'Acme Flexi Cap Fund - Direct Plan - Growth' }, { schemeCode: 100002, schemeName: 'Acme Flexi Cap Fund - Regular Plan' }]) : u.endsWith('/mf/100001') ? r(200, nav) : r(404, '')));
  const s = ctx.fundsearch_({ q: 'acme flexi' });
  ok(s.funds.length === 2 && s.funds[0].code === '100001' && /Direct/.test(s.funds[0].name) && calls[0].includes('q=acme%20flexi'), 'fundsearch: codes become text, the query is encoded');
  ok(ctx.fundsearch_({ q: 'ab' }).error, 'fundsearch: a query under 3 letters is refused without calling the service');
  const f = ctx.fundnav_({ code: '100001' });
  ok(f.d.join() === '2026-10-30,2026-11-02,2026-11-03' && f.c.join() === '149.9,150.5,151.2345', 'fundnav: dd-mm-yyyy becomes ISO, oldest first, unreadable rows dropped');
  ok(f.name.startsWith('Acme') && f.house === 'Acme Mutual Fund' && /Flexi/.test(f.category), 'fundnav: name, fund house and category come through');
  ok(ctx.fundnav_({ code: '999' }).error && ctx.fundnav_({ code: '' }).error, 'fundnav: an unknown or empty code gives a plain error');
  const e = load((u, o, r) => r(200, { meta: {}, data: [] }));
  ok(e.ctx.fundnav_({ code: '5' }).error, 'fundnav: no history gives a plain error');
}
console.log(bad ? bad + ' failed' : 'all passed'); process.exit(bad ? 1 : 0);
