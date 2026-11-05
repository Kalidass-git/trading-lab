// Trading Lab: share price history and company figures. Saved on this device only, and fetched only when the person asks for them
// (a "Get data" button); nothing here runs by itself. One backend call per share brings the quote, daily candles and company figures.
import { S } from '../store.js';
import { call } from '../remote.js';

const HK = 'lab.hist.', IDX = 'lab.hist.index', KEEP = 40;
const mem = new Map();
const rd = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const index = () => rd(IDX) || [];

/** Saved data for a share: { symbol, ts, ticker, hist: { d, o, h, l, c, v }, fund, notes } or null. */
export function dataOf(sym) {
  const k = String(sym || '').toUpperCase();
  if (!k) return null;
  if (mem.has(k)) return mem.get(k);
  const v = rd(HK + k); mem.set(k, v); return v;
}
export const hasHistory = (sym) => { const d = dataOf(sym); return !!(d && d.hist && d.hist.c && d.hist.c.length); };
function save(rec) {
  const k = rec.symbol; mem.set(k, rec);
  let idx = index().filter((x) => x !== k); idx.push(k);
  const put = () => { localStorage.setItem(HK + k, JSON.stringify(rec)); localStorage.setItem(IDX, JSON.stringify(idx)); };
  try { while (idx.length > KEEP) { const old = idx.shift(); localStorage.removeItem(HK + old); mem.delete(old); } put(); return true; }
  catch {                                                  // storage full: drop the oldest saved shares until it fits
    for (let i = 0; i < 6 && idx.length > 1; i++) { const old = idx.shift(); if (old === k) continue; try { localStorage.removeItem(HK + old); mem.delete(old); put(); return true; } catch { /* keep trying */ } }
    return false;
  }
}
/**
 * Fetch quote, history and company figures for one share (one backend call). `yahoo` is the Yahoo ticker for indexes (^NSEI) or foreign shares.
 * Returns the saved record, or throws a plain message. Keeps older company figures when this reply has none.
 */
export async function load(symbol, { yahoo = '', fundamentals = true, range = null } = {}) {
  if (!S.remote) throw new Error('Price history needs the Google Drive backend. Connect it in Settings.');
  const sym = String(symbol).toUpperCase(), prev = dataOf(sym), want = range || (prev && prev.range) || '5y';   // a reload keeps the length the person chose (a 10-year index stays 10 years)
  const res = await call(S.cfg.backendUrl, S.cfg.key, 'detail', { symbol: sym, yahoo, fundamentals, range: want });
  if (res.error) throw new Error(res.error);
  if (!res.history || !res.history.c || !res.history.c.length) throw new Error('No price history came back for ' + sym + '.');
  const old = prev, rec = { symbol: sym, range: want, ts: Date.now(), ticker: res.ticker, yahoo, quote: res.quote || null, hist: res.history, fund: res.fundamentals || (old && old.fund) || null, fundTs: res.fundamentals ? Date.now() : (old && old.fundTs) || 0, notes: res.notes || [] };
  if (!save(rec)) throw new Error('This device has no room left to keep the price history. Clear some saved data in Settings.');
  return rec;
}

/** Index of the last candle on or before `date` (YYYY-MM-DD), or -1. */
export function indexOn(d, date) {
  const a = d.d; let lo = 0, hi = a.length - 1, r = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (a[m] <= date) { r = m; lo = m + 1; } else hi = m - 1; }
  return r;
}
/** Close on a date (or the last one before it, for weekends and holidays). Null when there is no history that far back. */
export function closeOn(sym, date) {
  const rec = dataOf(sym); if (!rec || !rec.hist) return null;
  const h = rec.hist, i = indexOn(h, date);
  return i < 0 ? null : h.c[i];
}
/** The candle for an exact trading day, or null (a weekend, a holiday, or outside the loaded range). */
export function candleOn(sym, date) {
  const rec = dataOf(sym); if (!rec || !rec.hist) return null;
  const h = rec.hist, i = indexOn(h, date);
  return i >= 0 && h.d[i] === date ? { date, o: h.o[i], h: h.h[i], l: h.l[i], c: h.c[i], v: h.v[i] } : null;
}
/** Candles inside a range, newest last: 1M 3M 6M 1Y 3Y 5Y ALL. */
export function slice(hist, range, today) {
  const n = { '1M': 31, '3M': 92, '6M': 183, '1Y': 366, '3Y': 1096, '5Y': 1827 }[range];
  if (!n) return { ...hist, from: 0 };
  const t = new Date(Date.parse(today + 'T00:00:00Z') - n * 864e5).toISOString().slice(0, 10);
  let from = hist.d.findIndex((d) => d >= t); if (from < 0) from = Math.max(0, hist.d.length - 2);
  const cut = (a) => a.slice(from);
  return { d: cut(hist.d), o: cut(hist.o), h: cut(hist.h), l: cut(hist.l), c: cut(hist.c), v: cut(hist.v), from };
}
/** Simple moving average over closes (null until enough candles). */
export function sma(c, n) { const out = []; let s = 0; for (let i = 0; i < c.length; i++) { s += c[i]; if (i >= n) s -= c[i - n]; out.push(i >= n - 1 ? s / n : null); } return out; }
/** Return over the last `days` calendar days from the candles, or null. */
export function returnOver(sym, days, today) {
  const rec = dataOf(sym); if (!rec || !rec.hist) return null;
  const h = rec.hist, last = h.c[h.c.length - 1], t = new Date(Date.parse(today + 'T00:00:00Z') - days * 864e5).toISOString().slice(0, 10), i = indexOn(h, t);
  return i < 0 || !(h.c[i] > 0) ? null : last / h.c[i] - 1;
}
export const clearAll = () => { for (const k of index()) { try { localStorage.removeItem(HK + k); } catch { /* ignore */ } } try { localStorage.removeItem(IDX); } catch { /* ignore */ } mem.clear(); };
