// Trading Lab: prices. Own saved copy (this device only) and own refresh, so refreshing here never changes the real portfolio's prices.
import { S } from '../store.js';
import { call } from '../remote.js';
import { replay } from './model.js';

const QK = 'lab.quotes', TK = 'lab.refreshedAt';
let cache = null;
const load = () => { try { return JSON.parse(localStorage.getItem(QK) || '{}') || {}; } catch { return {}; } };
export const quotes = () => (cache = cache || load());
export const quoteOf = (sym) => quotes()[String(sym || '').toUpperCase()] || null;
export const refreshedAt = () => { try { return Number(localStorage.getItem(TK)) || 0; } catch { return 0; } };
/** For a symbol typed as a Yahoo ticker (^NSEI, RELIANCE.NS, GC=F) the ticker is sent as is; plain NSE symbols let the backend try .NS then .BO. */
export const yahooFor = (sym, yahoo) => yahoo || (/[.^=\-]/.test(sym) ? sym : '');

/** Every symbol the Lab needs a price for: open holdings, option underlyings, watchlists and baskets. */
export function symbolsNeeded(lab) {
  const m = new Map(), add = (symbol, yahoo) => { const k = String(symbol || '').toUpperCase(); if (k && !m.has(k)) m.set(k, { symbol: k, yahoo: yahooFor(k, yahoo) }); else if (k && yahoo && !m.get(k).yahoo) m.get(k).yahoo = yahoo; };
  for (const a of lab.accounts) { if (a.archived) continue; const rp = replay(lab.txns.filter((t) => t.acct === a.id)); rp.holdings.forEach((p) => add(p.symbol, p.yahoo)); rp.options.forEach((p) => add(p.underlying, p.yahoo)); }
  for (const w of lab.watchlists || []) for (const i of w.items || []) add(i.symbol, i.yahoo);
  for (const b of lab.baskets || []) for (const i of b.items || []) add(i.symbol, i.yahoo);
  return [...m.values()];
}
/** One backend call for all symbols (the same quote service the main app uses, read only). Saves what came back; keeps old prices for the rest. */
export async function refresh(lab, extra = []) {
  if (!S.remote) throw new Error('Prices need the Google Drive backend. Connect it in Settings.');
  const list = symbolsNeeded(lab);
  for (const e of extra) if (!list.some((x) => x.symbol === String(e.symbol).toUpperCase())) list.push({ symbol: String(e.symbol).toUpperCase(), yahoo: yahooFor(e.symbol, e.yahoo) });
  if (!list.length) return { got: 0, errors: [], none: true };
  const next = { ...quotes() }, now = Date.now(), errors = [];
  let got = 0;
  for (let i = 0; i < list.length; i += 100) {
    const res = await call(S.cfg.backendUrl, S.cfg.key, 'quotes', { symbols: list.slice(i, i + 100) });
    for (const [sym, q] of Object.entries(res.quotes || {})) if (q && q.price > 0) { next[sym.toUpperCase()] = { price: q.price, prevClose: q.prevClose || null, ts: now }; got++; }
    for (const [sym, msg] of Object.entries(res.errors || {})) errors.push(`${sym}: ${msg}`);
  }
  cache = next;
  try { localStorage.setItem(QK, JSON.stringify(next)); localStorage.setItem(TK, String(now)); } catch { /* storage full or private window: prices stay for this session */ }
  return { got, errors, total: list.length };
}
