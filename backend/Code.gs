/**
 * Trading Lab backend. Runs inside YOUR Google account (Apps Script) and keeps one JSON file in YOUR Google Drive.
 * It is separate from any other app: its own script, its own Drive folder, its own key. Setup steps are in docs/SETUP.md.
 *
 * One key (ACCESS_KEY, stored in Script Properties, never in the app code) opens everything: read, write, share prices, price history and fundamentals.
 */
var FOLDER_NAME = 'Trading Lab Data';
var FILE_NAME = 'trading-lab-data.json';
var KEEP_BACKUPS = 30;

/** Run this once from the editor. It creates the Drive folder and file, and makes the key. */
function setup() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('ACCESS_KEY')) props.setProperty('ACCESS_KEY', randomKey_());
  getFile_();
  Logger.log('Drive folder: "' + FOLDER_NAME + '" (in My Drive)');
  Logger.log('ACCESS_KEY (keep private): ' + props.getProperty('ACCESS_KEY'));
  Logger.log('Next: Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone), then copy the /exec URL.');
}
/** Run this to print the key again, or call setKey('your-own-key-of-16-or-more-characters') to choose your own. */
function showKey() { Logger.log('ACCESS_KEY: ' + PropertiesService.getScriptProperties().getProperty('ACCESS_KEY')); }
function setKey(key) {
  if (!key || key.length < 16) throw new Error('Use a key of at least 16 characters.');
  PropertiesService.getScriptProperties().setProperty('ACCESS_KEY', key);
}

function randomKey_() { return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').slice(0, 32); }
function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
/** Compares two strings in the same time whatever they contain, so the key cannot be guessed from timing. */
function same_(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  var r = 0;
  for (var i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
function allowed_(key) { return same_(key, PropertiesService.getScriptProperties().getProperty('ACCESS_KEY')); }
function getFolder_() {
  var it = DriveApp.getFoldersByName(FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
}
function getFile_() {
  var folder = getFolder_();
  var it = folder.getFilesByName(FILE_NAME);
  if (it.hasNext()) return it.next();
  return folder.createFile(FILE_NAME, JSON.stringify({ version: 0, updatedAt: null, data: null }), MimeType.PLAIN_TEXT);
}
function readStore_() {
  try { return JSON.parse(getFile_().getBlob().getDataAsString()); } catch (e) { return { version: 0, updatedAt: null, data: null }; }
}
function backup_(file) {
  var folder = getFolder_();
  var name = 'backup-' + Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd') + '.json';
  var subs = folder.getFoldersByName('backups');
  var bf = subs.hasNext() ? subs.next() : folder.createFolder('backups');
  var existing = bf.getFilesByName(name);
  if (!existing.hasNext()) bf.createFile(name, file.getBlob().getDataAsString(), MimeType.PLAIN_TEXT);
  var files = [], all = bf.getFiles();
  while (all.hasNext()) files.push(all.next());
  files.sort(function (a, b) { return b.getName() < a.getName() ? -1 : 1; });
  for (var i = KEEP_BACKUPS; i < files.length; i++) files[i].setTrashed(true);
}

function doGet(e) {
  return json_({ ok: true, app: 'trading-lab-backend', message: 'The backend is running. Open the Trading Lab app and connect with your key.' });
}

function doPost(e) {
  var req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return json_({ error: 'Bad request.' }); }
  if (!allowed_(String(req.key || ''))) return json_({ error: 'The access key is not correct.' });
  try {
    switch (req.action) {
      case 'auth': return json_({ ok: true });
      case 'read': {
        var s = readStore_();
        return json_({ ok: true, version: s.version, updatedAt: s.updatedAt, data: s.data, empty: !s.data });
      }
      case 'write': {
        var lock = LockService.getScriptLock();
        lock.waitLock(20000);
        try {
          var file = getFile_();
          var cur = JSON.parse(file.getBlob().getDataAsString() || '{}');
          if (req.baseVersion != null && cur.version !== req.baseVersion) {
            return json_({ conflict: true, version: cur.version, updatedAt: cur.updatedAt });
          }
          if (cur.data) backup_(file);
          var next = { version: (cur.version || 0) + 1, updatedAt: new Date().toISOString(), data: req.data };
          file.setContent(JSON.stringify(next));
          return json_({ ok: true, version: next.version, updatedAt: next.updatedAt });
        } finally { lock.releaseLock(); }
      }
      case 'quotes': return json_(quotes_(req.symbols || []));
      case 'detail': return json_(detail_(req));
      case 'fundsearch': return json_(fundsearch_(req));
      case 'fundnav': return json_(fundnav_(req));
      default: return json_({ error: 'Unknown action.' });
    }
  } catch (err) {
    return json_({ error: 'Backend error: ' + err.message });
  }
}

var UA_ = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

/** Share prices from Yahoo Finance (NSE first, then BSE). symbols: [{symbol:'INFY', yahoo:'' }] */
function quotes_(list) {
  var out = {}, errors = {};
  var reqs = [], meta = [];
  list.slice(0, 120).forEach(function (s) {
    var tickers = s.yahoo ? [s.yahoo] : [s.symbol + '.NS', s.symbol + '.BO'];
    meta.push({ symbol: s.symbol, tickers: tickers });
    reqs.push(url_(tickers[0]));
  });
  var res = UrlFetchApp.fetchAll(reqs);
  var retry = [];
  res.forEach(function (r, i) {
    var q = parse_(r);
    if (q) out[meta[i].symbol] = q; else if (meta[i].tickers.length > 1) retry.push(i); else errors[meta[i].symbol] = 'no price';
  });
  if (retry.length) {
    var r2 = UrlFetchApp.fetchAll(retry.map(function (i) { return url_(meta[i].tickers[1]); }));
    r2.forEach(function (r, k) {
      var i = retry[k], q = parse_(r);
      if (q) out[meta[i].symbol] = q; else errors[meta[i].symbol] = 'no price found on NSE or BSE';
    });
  }
  return { ok: true, quotes: out, errors: errors };
}
function url_(ticker, range, interval) {
  return { url: 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(ticker) + '?range=' + (range || '1d') + '&interval=' + (interval || '1d'), muteHttpExceptions: true, headers: { 'User-Agent': UA_ } };
}
/** One quote from a Yahoo chart reply: price, previous close, day and 52-week range, volume, name. Null when there is no price. */
function parse_(r) {
  try {
    if (r.getResponseCode() !== 200) return null;
    return quoteFromChart_(JSON.parse(r.getContentText()));
  } catch (e) { return null; }
}
function quoteFromChart_(j) {
  var m = j.chart.result[0].meta;
  if (!m || !(m.regularMarketPrice > 0)) return null;
  return { price: m.regularMarketPrice, prevClose: m.chartPreviousClose || null, high52: m.fiftyTwoWeekHigh || null, low52: m.fiftyTwoWeekLow || null,
    dayHigh: m.regularMarketDayHigh || null, dayLow: m.regularMarketDayLow || null, volume: m.regularMarketVolume || null,
    name: m.longName || m.shortName || '', exchange: m.fullExchangeName || m.exchangeName || '', currency: m.currency || '' };
}
/** Daily candles from a Yahoo chart reply, as parallel arrays (small to send and to keep): d dates, o h l c prices, v volume in thousands. */
function historyFromChart_(j) {
  var res = j.chart.result[0], ts = res.timestamp || [], q = (res.indicators && res.indicators.quote && res.indicators.quote[0]) || {};
  var h = { d: [], o: [], h: [], l: [], c: [], v: [] };
  var r2 = function (x) { return Math.round(x * 100) / 100; };
  for (var i = 0; i < ts.length; i++) {
    var c = q.close && q.close[i];
    if (!(c > 0)) continue;                                   // holidays and gaps come back as null
    h.d.push(dateIst_(ts[i])); h.c.push(r2(c));
    h.o.push(r2(q.open && q.open[i] > 0 ? q.open[i] : c)); h.h.push(r2(q.high && q.high[i] > 0 ? q.high[i] : c)); h.l.push(r2(q.low && q.low[i] > 0 ? q.low[i] : c));
    h.v.push(Math.round(((q.volume && q.volume[i]) || 0) / 1000));
  }
  return h;
}
function dateIst_(sec) {
  if (typeof Utilities !== 'undefined' && Utilities.formatDate) return Utilities.formatDate(new Date(sec * 1000), 'Asia/Kolkata', 'yyyy-MM-dd');
  return new Date(sec * 1000 + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}
/** The raw number of a Yahoo value ({raw, fmt}), or null. */
function raw_(v) { return v && typeof v === 'object' ? (v.raw != null ? v.raw : null) : (v == null ? null : v); }
/** Key figures about a company from a Yahoo quoteSummary reply. Anything Yahoo does not give is null. */
function fundamentalsFromSummary_(j) {
  var r = j.quoteSummary.result[0], sd = r.summaryDetail || {}, ks = r.defaultKeyStatistics || {}, fd = r.financialData || {}, ap = r.assetProfile || {}, pr = r.price || {};
  var pct = function (x) { x = raw_(x); return x == null ? null : x; };
  return {
    name: pr.longName || pr.shortName || '', sector: ap.sector || '', industry: ap.industry || '', about: (ap.longBusinessSummary || '').slice(0, 600), website: ap.website || '', employees: ap.fullTimeEmployees || null,
    marketCap: raw_(pr.marketCap) || raw_(sd.marketCap), pe: raw_(sd.trailingPE), forwardPe: raw_(sd.forwardPE) || raw_(ks.forwardPE), pb: raw_(ks.priceToBook), eps: raw_(ks.trailingEps), bookValue: raw_(ks.bookValue),
    dividendYield: raw_(sd.dividendYield), beta: raw_(sd.beta) || raw_(ks.beta), avgVolume: raw_(sd.averageVolume),
    roe: pct(fd.returnOnEquity), roa: pct(fd.returnOnAssets), profitMargin: pct(fd.profitMargins), operatingMargin: pct(fd.operatingMargins), revenueGrowth: pct(fd.revenueGrowth), earningsGrowth: pct(fd.earningsGrowth),
    debtToEquity: raw_(fd.debtToEquity), currentRatio: raw_(fd.currentRatio), revenue: raw_(fd.totalRevenue), freeCashflow: raw_(fd.freeCashflow),
    targetMean: raw_(fd.targetMeanPrice), recommendation: fd.recommendationKey || '', analysts: raw_(fd.numberOfAnalystOpinions)
  };
}
/** Yahoo asks for a cookie and a "crumb" before it gives company figures. Fetched once and kept for 6 hours. */
function crumb_() {
  var cache = CacheService.getScriptCache(), hit = cache.get('yf-crumb');
  if (hit) return JSON.parse(hit);
  var r = UrlFetchApp.fetch('https://fc.yahoo.com', { muteHttpExceptions: true, followRedirects: false, headers: { 'User-Agent': UA_ } });
  var hd = r.getAllHeaders(), sc = hd['Set-Cookie'] || hd['set-cookie'] || [];
  var cookie = (Array.isArray(sc) ? sc : [sc]).filter(Boolean).map(function (c) { return String(c).split(';')[0]; }).join('; ');
  if (!cookie) return null;
  var c = UrlFetchApp.fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', { muteHttpExceptions: true, headers: { 'User-Agent': UA_, Cookie: cookie } });
  var text = c.getContentText();
  if (c.getResponseCode() !== 200 || !text || text.length > 40) return null;
  var out = { cookie: cookie, crumb: text };
  cache.put('yf-crumb', JSON.stringify(out), 21600);
  return out;
}
function fundamentals_(ticker) {
  var k = crumb_();
  if (!k) throw new Error('Yahoo did not give the access code needed for company figures.');
  var u = 'https://query2.finance.yahoo.com/v10/finance/quoteSummary/' + encodeURIComponent(ticker) + '?modules=price,summaryDetail,defaultKeyStatistics,financialData,assetProfile&crumb=' + encodeURIComponent(k.crumb);
  var r = UrlFetchApp.fetch(u, { muteHttpExceptions: true, headers: { 'User-Agent': UA_, Cookie: k.cookie } });
  if (r.getResponseCode() === 401 || r.getResponseCode() === 403) { CacheService.getScriptCache().remove('yf-crumb'); throw new Error('Yahoo refused the request for company figures.'); }
  if (r.getResponseCode() !== 200) throw new Error('Yahoo has no company figures for ' + ticker + '.');
  return fundamentalsFromSummary_(JSON.parse(r.getContentText()));
}
/**
 * Everything the stock page needs for one share, in one call: the quote, daily history and (optionally) company figures.
 * req = { symbol, yahoo, range: '1y' | '5y' | 'max', fundamentals: true|false }. Index symbols pass their Yahoo code in `yahoo`.
 * History and figures fail separately: a share with a price but no company figures (an index, say) still returns the rest.
 */
function detail_(req) {
  var sym = String(req.symbol || '').toUpperCase();
  if (!sym) return { error: 'No symbol given.' };
  var tickers = req.yahoo ? [req.yahoo] : [sym + '.NS', sym + '.BO'], range = /^(1y|2y|5y|10y|max)$/.test(req.range) ? req.range : '5y';
  var out = { ok: true, symbol: sym, ticker: null, quote: null, history: null, fundamentals: null, notes: [] };
  for (var i = 0; i < tickers.length && !out.history; i++) {
    var r = UrlFetchApp.fetch(url_(tickers[i], range, '1d').url, { muteHttpExceptions: true, headers: { 'User-Agent': UA_ } });
    try {
      if (r.getResponseCode() !== 200) continue;
      var j = JSON.parse(r.getContentText()), q = quoteFromChart_(j), h = historyFromChart_(j);
      if (!q || !h.c.length) continue;
      var n = h.c.length, lastDay = dateIst_(j.chart.result[0].meta.regularMarketTime || 0);
      q.prevClose = n > 1 ? (h.d[n - 1] === lastDay ? h.c[n - 2] : h.c[n - 1]) : q.prevClose;   // a 5-year chart's own "previous close" is from before the range
      out.ticker = tickers[i]; out.quote = q; out.history = h;
    } catch (e) { /* try the next exchange */ }
  }
  if (!out.history) return { error: 'No price history found for ' + sym + ' on ' + tickers.join(' or ') + '.' };
  if (req.fundamentals !== false) {
    try { out.fundamentals = fundamentals_(out.ticker); } catch (e) { out.notes.push(String(e.message || e)); }
  }
  return out;
}

// ---------- mutual funds (NAV history from the free mfapi.in service, which republishes AMFI data) ----------
/** Search funds by name. req = { q: 'parag parikh flexi' }. Returns { funds: [{ code, name }] } (at most 30). */
function fundsearch_(req) {
  var q = String(req.q || '').replace(/\s+/g, ' ').trim();
  if (q.length < 3) return { error: 'Type at least 3 letters of the fund name.' };
  var r = UrlFetchApp.fetch('https://api.mfapi.in/mf/search?q=' + encodeURIComponent(q), { muteHttpExceptions: true, headers: { 'User-Agent': UA_ } });
  if (r.getResponseCode() !== 200) return { error: 'The fund service did not answer (code ' + r.getResponseCode() + ').' };
  var list;
  try { list = JSON.parse(r.getContentText()); } catch (e) { return { error: 'The fund service sent something unreadable.' }; }
  if (!Array.isArray(list)) return { error: 'The fund service sent something unexpected.' };
  return { ok: true, funds: list.slice(0, 30).map(function (f) { return { code: String(f.schemeCode), name: String(f.schemeName || '') }; }) };
}
/** "dd-mm-yyyy" to "yyyy-mm-dd" (null if it is not a date). */
function isoFromDmy_(s) {
  var m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(s || ''));
  return m ? m[3] + '-' + m[2] + '-' + m[1] : null;
}
/** Full NAV history of one fund, oldest first. req = { code }. Returns { code, name, house, category, type, d: [dates], c: [NAV] }. */
function fundnav_(req) {
  var code = String(req.code || '').replace(/[^0-9]/g, '');
  if (!code) return { error: 'No fund code given.' };
  var r = UrlFetchApp.fetch('https://api.mfapi.in/mf/' + code, { muteHttpExceptions: true, headers: { 'User-Agent': UA_ } });
  if (r.getResponseCode() !== 200) return { error: 'The fund service has no fund with code ' + code + ' (code ' + r.getResponseCode() + ').' };
  var j;
  try { j = JSON.parse(r.getContentText()); } catch (e) { return { error: 'The fund service sent something unreadable.' }; }
  var rows = (j && j.data) || [];
  if (!rows.length) return { error: 'The fund service has no NAV history for code ' + code + '.' };
  var pairs = [];
  rows.forEach(function (x) { var d = isoFromDmy_(x.date), n = Number(x.nav); if (d && n > 0) pairs.push([d, Math.round(n * 10000) / 10000]); });
  pairs.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; });   // the service lists newest first
  var m = j.meta || {};
  return { ok: true, code: code, name: String(m.scheme_name || ''), house: String(m.fund_house || ''), category: String(m.scheme_category || ''), type: String(m.scheme_type || ''),
    d: pairs.map(function (p) { return p[0]; }), c: pairs.map(function (p) { return p[1]; }) };
}
