// Trading Lab: mutual funds and indexes. Fund NAV history comes from the backend ("fundnav", the free mfapi.in service) and index history from
// Yahoo Finance (the same "detail" call shares use). Everything is fetched only when a button is pressed, and kept on this device.
// Which funds you follow, and any index you add or re-code, are saved with your data as optional lists (lab.funds, lab.indexes).
import { S } from '../store.js';
import { call } from '../remote.js';
import * as HS from './history.js';
import * as MK from './market.js';
import { dayNo, fromDayNo } from './series.js';

/** Indexes offered out of the box. `yahoo` is the Yahoo Finance code. They are from memory of Yahoo's naming and were not checked
 *  against Yahoo from here: if one returns no data, change its code in the index's page (Edit code) and press Load again. */
export const INDEXES = [
  { sym: 'NIFTY', name: 'NIFTY 50', yahoo: '^NSEI', group: 'Large cap' },
  { sym: 'SENSEX', name: 'BSE SENSEX', yahoo: '^BSESN', group: 'Large cap' },
  { sym: 'NIFTYNEXT50', name: 'NIFTY Next 50', yahoo: '^NSMIDCP', group: 'Large cap' },
  { sym: 'NIFTY100', name: 'NIFTY 100', yahoo: '^CNX100', group: 'Large cap' },
  { sym: 'NIFTYMID100', name: 'NIFTY Midcap 100', yahoo: 'NIFTY_MIDCAP_100.NS', group: 'Mid and small' },
  { sym: 'NIFTYSMALL100', name: 'NIFTY Smallcap 100', yahoo: '^CNXSC', group: 'Mid and small' },
  { sym: 'NIFTY500', name: 'NIFTY 500', yahoo: '^CRSLDX', group: 'Broad' },
  { sym: 'BANKNIFTY', name: 'NIFTY Bank', yahoo: '^NSEBANK', group: 'Sectors' },
  { sym: 'NIFTYIT', name: 'NIFTY IT', yahoo: '^CNXIT', group: 'Sectors' },
  { sym: 'NIFTYPHARMA', name: 'NIFTY Pharma', yahoo: '^CNXPHARMA', group: 'Sectors' },
  { sym: 'NIFTYFMCG', name: 'NIFTY FMCG', yahoo: '^CNXFMCG', group: 'Sectors' },
  { sym: 'NIFTYAUTO', name: 'NIFTY Auto', yahoo: '^CNXAUTO', group: 'Sectors' },
];
/** The catalogue with the person's own additions and re-coded entries (saved in lab.indexes: [{ id, sym, name, yahoo, group }]). */
export function indexList(lab) {
  const mine = (lab && lab.indexes) || [], by = new Map(INDEXES.map((x) => [x.sym, { ...x }]));
  for (const m of mine) if (m && m.sym) by.set(m.sym, { ...(by.get(m.sym) || { group: 'Mine' }), ...m, custom: true });
  return [...by.values()];
}
export const indexBySym = (lab, sym) => indexList(lab).find((x) => x.sym === String(sym || '').toUpperCase()) || null;
export const cleanSym = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20);

/** Which index a fund is compared with unless the person picks another, guessed from the fund's category and name. */
export function suggestBenchmark(name = '', category = '') {
  const t = (name + ' ' + category).toLowerCase();
  if (/small\s?cap/.test(t)) return 'NIFTYSMALL100';
  if (/mid\s?cap/.test(t)) return 'NIFTYMID100';
  if (/next 50|junior/.test(t)) return 'NIFTYNEXT50';
  if (/sensex/.test(t)) return 'SENSEX';
  if (/bank/.test(t)) return 'BANKNIFTY';
  if (/nifty 500|flexi|multi cap|multicap|focused|elss|tax|value|contra|dividend yield/.test(t)) return 'NIFTY500';
  return 'NIFTY';
}

// ---------- fund NAV: kept on this device, dates stored as day gaps to save room ----------
const FK = 'lab.fund.', FIDX = 'lab.fund.index', KEEP = 30;
const mem = new Map();
const rd = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const index = () => rd(FIDX) || [];
const pack = (r) => { const d0 = r.d[0], gaps = []; let prev = dayNo(d0); for (const x of r.d) { const n = dayNo(x); gaps.push(n - prev); prev = n; } return { code: r.code, name: r.name, house: r.house, category: r.category, type: r.type, ts: r.ts, d0, g: gaps, c: r.c }; };
const unpack = (p) => { if (!p || !p.g || !p.c) return null; let n = dayNo(p.d0); const d = p.g.map((g) => fromDayNo((n += g))); return { code: p.code, name: p.name, house: p.house, category: p.category, type: p.type, ts: p.ts, d, c: p.c }; };

/** Saved NAV for a fund code: { code, name, house, category, type, ts, d: [dates], c: [NAV] } or null. */
export function dataOf(code) {
  const k = String(code || ''); if (!k) return null;
  if (mem.has(k)) return mem.get(k);
  const v = unpack(rd(FK + k)); mem.set(k, v); return v;
}
export function remove(code) { try { localStorage.removeItem(FK + code); localStorage.setItem(FIDX, JSON.stringify(index().filter((x) => x !== String(code)))); } catch { /* ignore */ } mem.delete(String(code)); }
function save(rec) {
  const k = rec.code; mem.set(k, rec);
  let idx = index().filter((x) => x !== k); idx.push(k);
  const put = () => { localStorage.setItem(FK + k, JSON.stringify(pack(rec))); localStorage.setItem(FIDX, JSON.stringify(idx)); };
  try { while (idx.length > KEEP) { const old = idx.shift(); localStorage.removeItem(FK + old); mem.delete(old); } put(); return true; }
  catch { for (let i = 0; i < 6 && idx.length > 1; i++) { const old = idx.shift(); if (old === k) continue; try { localStorage.removeItem(FK + old); mem.delete(old); put(); return true; } catch { /* keep trying */ } } return false; }
}
export const clearAll = () => { for (const k of index()) { try { localStorage.removeItem(FK + k); } catch { /* ignore */ } } try { localStorage.removeItem(FIDX); } catch { /* ignore */ } mem.clear(); };

/** Search fund names (pressed by the person, never automatic). Returns [{ code, name }]. */
export async function search(q) {
  if (!S.remote) throw new Error('Fund search needs the Google Drive backend. Connect it in Settings.');
  const res = await call(S.cfg.backendUrl, S.cfg.key, 'fundsearch', { q });
  if (res.error) throw new Error(res.error);
  return res.funds || [];
}
/** Download the full NAV history of one fund and keep it. Throws a plain message. */
export async function load(code) {
  if (!S.remote) throw new Error('Fund data needs the Google Drive backend. Connect it in Settings.');
  const res = await call(S.cfg.backendUrl, S.cfg.key, 'fundnav', { code });
  if (res.error) throw new Error(res.error);
  if (!res.d || res.d.length < 2) throw new Error('Not enough NAV history came back for this fund.');
  const rec = { code: String(res.code || code), name: res.name || '', house: res.house || '', category: res.category || '', type: res.type || '', ts: Date.now(), d: res.d, c: res.c };
  if (!save(rec)) throw new Error('This device has no room left to keep the fund history. Clear some saved data in Settings.');
  return rec;
}
/** Funds the person follows (saved with their data): [{ id, code, name, bench }]. */
export const followed = (lab) => (lab && lab.funds) || [];
/** Plain-plan warning: regular and direct plans of one scheme differ in cost, so a comparison should use the same kind. */
export const planOf = (name = '') => (/direct/i.test(name) ? 'Direct' : /regular/i.test(name) ? 'Regular' : '');
export const optionOf = (name = '') => (/\b(idcw|dividend|payout|bonus)\b/i.test(name) ? 'Income (IDCW)' : /growth/i.test(name) ? 'Growth' : '');
/** The series a page can chart for an index or a fund. Index rows are prices (without dividends), fund rows are NAV (with them). */
export const seriesOfIndex = (sym) => { const r = HS.dataOf(sym); return r && r.hist && r.hist.c && r.hist.c.length ? r.hist : null; };
export const seriesOfFund = (code) => { const r = dataOf(code); return r ? { d: r.d, o: r.c, h: r.c, l: r.c, c: r.c, v: r.c.map(() => 0) } : null; };
/** Download an index's daily history from Yahoo (one backend call). `range` is 1y, 5y, 10y or max; null keeps the length already on this device. */
export async function loadIndex(ix, range = null) {
  const rec = await HS.load(ix.sym, { yahoo: ix.yahoo, fundamentals: false, range });
  MK.putQuote(ix.sym, rec.quote);
  return rec;
}
