// Trading Lab: valuations across accounts, daily snapshots and report rows. Pure functions (prices are passed in).
import { replay, valueAccount, optKey, r2, isOpt, grossP } from './model.js';
import { optionPremium } from './options.js';
import { istDate } from './time.js';

const markOf = (lab, key) => (lab.marks || []).find((m) => m.id === key) || null;
/** Replay and valuation of one account at `nowMs`, using `quote(symbol)`. */
export function accountBook(lab, acct, quote, nowMs) {
  const rp = replay(lab.txns.filter((t) => t.acct === acct.id), { today: istDate(nowMs) });
  const spot = (u) => { const q = quote(u); return q && q.price > 0 ? q.price : null; };
  const optionPrice = (p) => optionPremium(p, spot(p.underlying), markOf(lab, p.key), lab.settings, nowMs);
  return { acct, rp, v: valueAccount(rp, quote, optionPrice, acct) };
}
export const allBooks = (lab, quote, nowMs, { archived = false } = {}) => lab.accounts.filter((a) => archived || !a.archived).map((a) => accountBook(lab, a, quote, nowMs));
const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
/** Totals over several accounts. */
export function totals(books) {
  const v = books.map((b) => b.v), dep = sum(v, (x) => x.deposited), value = sum(v, (x) => x.value), pnl = value - dep;
  return { capital: r2(dep), cash: r2(sum(v, (x) => x.cash)), value: r2(value), pnl: r2(pnl), ret: dep > 0 ? pnl / dep : 0, day: r2(sum(v, (x) => x.day)), positions: sum(v, (x) => x.positions), realized: r2(sum(v, (x) => x.realized)), unrealized: r2(sum(v, (x) => x.unrealized)), fees: r2(sum(v, (x) => x.fees)), unpriced: sum(v, (x) => x.unpriced) };
}
/** The readings that should exist for today: one per account per day. */
function wantedSnaps(lab, quote, nowMs) {
  const date = istDate(nowMs);
  return allBooks(lab, quote, nowMs).map((b) => ({ id: `${b.acct.id}|${date}`, acct: b.acct.id, date, value: r2(b.v.value), deposited: r2(b.v.deposited), pnl: r2(b.v.pnl) }));
}
/** Would saving today's readings change anything? (Lets the app skip a save when nothing moved.) */
export function snapsNeeded(lab, quote, nowMs) {
  return wantedSnaps(lab, quote, nowMs).some((rec) => { const cur = (lab.snaps || []).find((s) => s.id === rec.id); return !cur || cur.value !== rec.value || cur.deposited !== rec.deposited; });
}
/** One reading per account per day, so the performance chart has a history. Returns true when something changed. */
export function upsertSnaps(lab, quote, nowMs) {
  let changed = false;
  lab.snaps = lab.snaps || [];
  for (const rec of wantedSnaps(lab, quote, nowMs)) {
    const cur = lab.snaps.find((s) => s.id === rec.id);
    if (!cur) { lab.snaps.push(rec); changed = true; } else if (cur.value !== rec.value || cur.deposited !== rec.deposited) { Object.assign(cur, rec); changed = true; }
  }
  return changed;
}
/** Points for the performance chart: one per day, summed over the chosen accounts (a day an account has no reading carries its last one). */
export function curve(lab, acctIds) {
  const ids = new Set(acctIds), snaps = (lab.snaps || []).filter((s) => ids.has(s.acct)).sort((a, b) => (a.date < b.date ? -1 : 1));
  const dates = [...new Set(snaps.map((s) => s.date))], last = new Map(), out = [];
  for (const d of dates) { for (const s of snaps.filter((x) => x.date === d)) last.set(s.acct, s); const cur = [...last.values()]; out.push({ date: d, value: r2(sum(cur, (s) => s.value)), pnl: r2(sum(cur, (s) => s.pnl)) }); }
  return out;
}

export const COLS = {
  trades: [['date', 'Date'], ['account', 'Account'], ['type', 'Type'], ['symbol', 'Symbol'], ['name', 'Name'], ['qty', 'Quantity'], ['price', 'Price'], ['amount', 'Amount'], ['fees', 'Charges'], ['realized', 'Realised P&L'], ['strategy', 'Strategy'], ['basket', 'Basket'], ['note', 'Note']],
};
const TYPE_LABEL = { deposit: 'Deposit', withdraw: 'Withdrawal', buy: 'Buy', sell: 'Sell', obuy: 'Option buy', osell: 'Option sell', oexp: 'Option expiry' };
export const typeLabel = (t) => TYPE_LABEL[t] || t;
/** Every transaction as a flat row, with account name, realised profit and the strategy it belongs to. */
export function tradeRows(lab, f = {}) {
  const names = new Map(lab.accounts.map((a) => [a.id, a.name])), bk = new Map((lab.baskets || []).map((b) => [b.id, b.name]));
  let rows = [];
  for (const a of lab.accounts) for (const t of replay(lab.txns.filter((x) => x.acct === a.id)).rows) rows.push({ id: t.id, date: t.date, acct: a.id, account: names.get(a.id), type: t.type, typeLabel: typeLabel(t.type), symbol: t.symbol || '', name: t.name || '', qty: t.qty ?? '', price: t.price ?? '', amount: t.amount, fees: t.fees || 0, realized: t.realized ?? '', strategy: isOpt(t.type) ? 'Options' : t.basket ? 'Baskets' : t.type === 'buy' || t.type === 'sell' ? 'Stocks' : 'Cash', basket: t.basket ? bk.get(t.basket) || '' : '', note: t.note || '', ts: t.ts || '' });
  if (f.acct && f.acct !== 'all') rows = rows.filter((r) => r.acct === f.acct);
  if (f.from) rows = rows.filter((r) => r.date >= f.from);
  if (f.to) rows = rows.filter((r) => r.date <= f.to);
  if (f.type && f.type !== 'all') rows = rows.filter((r) => r.type === f.type || (f.type === 'trades' && r.strategy !== 'Cash'));
  if (f.strategy && f.strategy !== 'all') rows = rows.filter((r) => r.strategy === f.strategy);
  if (f.q) { const q = String(f.q).toLowerCase(); rows = rows.filter((r) => `${r.symbol} ${r.name} ${r.note} ${r.basket}`.toLowerCase().includes(q)); }
  return rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.ts < b.ts ? 1 : -1));
}
/**
 * Strategy comparison by how each order was placed (plain stock orders, basket orders, option orders): money spent, money back,
 * what is still open at today's price, and the profit that makes (open value + money back - money spent, charges included).
 */
export function strategyPnl(lab, quote, nowMs, ids = null) {
  const names = ['Stocks', 'Baskets', 'Options'], out = Object.fromEntries(names.map((n) => [n, { orders: 0, spent: 0, back: 0, fees: 0, open: new Map(), unpriced: 0 }]));
  for (const t of lab.txns) {
    if (t.type === 'deposit' || t.type === 'withdraw' || (ids && !ids.has(t.acct))) continue;
    const o = isOpt(t.type), s = out[o ? 'Options' : t.basket ? 'Baskets' : 'Stocks'], g = grossP(t), f = Math.round((t.fees || 0) * 100), key = o ? optKey(t.opt) : t.symbol;
    s.orders++; s.fees += f;
    const cur = s.open.get(key) || { qty: 0, opt: o ? t.opt : null };
    if (t.type === 'buy' || t.type === 'obuy') { s.spent += g + f; cur.qty += Number(t.qty); } else { s.back += g - f; cur.qty -= Number(t.qty); }
    s.open.set(key, cur);
  }
  return Object.fromEntries(names.map((n) => {
    const s = out[n]; let value = 0, unpriced = 0;
    for (const [key, c] of s.open) {
      if (c.qty <= 1e-9) continue;
      if (c.opt) { const q = quote(c.opt.underlying), pr = optionPremium({ ...c.opt, key }, q && q.price > 0 ? q.price : null, markOf(lab, key), lab.settings, nowMs); if (pr && pr.premium != null) value += Math.round(c.qty * pr.premium * 100); else unpriced++; }
      else { const q = quote(key); if (q && q.price > 0) value += Math.round(c.qty * q.price * 100); else unpriced++; }
    }
    const pnl = value + s.back - s.spent;
    return [n, { orders: s.orders, spent: s.spent / 100, back: s.back / 100, fees: s.fees / 100, value: value / 100, pnl: pnl / 100, ret: s.spent ? pnl / s.spent : 0, unpriced }];
  }));
}
/** By symbol: orders, bought, sold, realised, open quantity and open profit across the chosen accounts. */
export function symbolSummary(rows, books) {
  const m = new Map();
  for (const r of rows) { if (!r.symbol || r.strategy === 'Cash') continue; const k = r.symbol + (r.strategy === 'Options' ? ' (options)' : ''); const s = m.get(k) || { symbol: k, orders: 0, bought: 0, sold: 0, realized: 0, fees: 0, open: 0, unrealized: 0 }; s.orders++; s.fees += Number(r.fees) || 0; if (r.type === 'buy' || r.type === 'obuy') s.bought += Number(r.amount) || 0; else s.sold += Number(r.amount) || 0; if (r.realized !== '') s.realized += Number(r.realized); m.set(k, s); }
  for (const b of books) { for (const p of b.v.holdings) { const s = m.get(p.symbol); if (s) { s.open += p.qty; s.unrealized += p.pnl; } } for (const p of b.v.options) { const s = m.get(p.underlying + ' (options)'); if (s) { s.open += p.qty; s.unrealized += p.pnl; } } }
  return [...m.values()].map((s) => ({ ...s, bought: r2(s.bought), sold: r2(s.sold), realized: r2(s.realized), fees: r2(s.fees), unrealized: r2(s.unrealized) }));
}
/** CSV text (with a byte-order mark so Excel reads the rupee sign and accents correctly). cols = [[key, heading]]. */
export function toCsv(cols, rows) {
  const cell = (v) => { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return '﻿' + [cols.map((c) => cell(c[1])).join(','), ...rows.map((r) => cols.map((c) => cell(r[c[0]])).join(','))].join('\r\n') + '\r\n';
}
