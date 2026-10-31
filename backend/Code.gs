/**
 * Trading Lab backend. Runs inside YOUR Google account (Apps Script) and keeps one JSON file in YOUR Google Drive.
 * It is separate from any other app: its own script, its own Drive folder, its own key. Setup steps are in docs/SETUP.md.
 *
 * One key (ACCESS_KEY, stored in Script Properties, never in the app code) opens everything: read, write and share prices.
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
      default: return json_({ error: 'Unknown action.' });
    }
  } catch (err) {
    return json_({ error: 'Backend error: ' + err.message });
  }
}

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
function url_(ticker) {
  return { url: 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(ticker) + '?range=1d&interval=1d', muteHttpExceptions: true, headers: { 'User-Agent': 'Mozilla/5.0' } };
}
function parse_(r) {
  try {
    if (r.getResponseCode() !== 200) return null;
    var m = JSON.parse(r.getContentText()).chart.result[0].meta;
    if (!m || !(m.regularMarketPrice > 0)) return null;
    return { price: m.regularMarketPrice, prevClose: m.chartPreviousClose || null, high52: m.fiftyTwoWeekHigh || null, low52: m.fiftyTwoWeekLow || null };
  } catch (e) { return null; }
}

