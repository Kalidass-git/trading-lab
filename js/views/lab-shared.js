// Trading Lab: small helpers shared by its screens.
import { S, commit } from '../store.js';
import * as M from '../lab/model.js';
import * as MK from '../lab/market.js';
import * as BK from '../lab/book.js';
import { istDate } from '../lab/time.js';
import { h, toast, money, dec, isMasked, pct } from '../ui.js';

export const LAB = () => S.data || M.emptyLab();
const savedAcct = () => { try { return localStorage.getItem('tl.acct') || 'all'; } catch { return 'all'; } };
/** `acct` is the account chosen at the top ('all' for every active account). It is remembered on this device. */
export const st = { acct: savedAcct() };
export const setAcct = (v) => { st.acct = v; try { localStorage.setItem('tl.acct', v); } catch { /* private window */ } };
export const rerender = () => window.dispatchEvent(new Event('rerender'));
export const quote = (s) => MK.quoteOf(s);
export const today = () => istDate(Date.now());
export const activeAccounts = (lab) => lab.accounts.filter((a) => !a.archived);
export const books = (opts) => BK.allBooks(LAB(), quote, Date.now(), opts);
/** The books for the account chosen at the top (or all of them). */
export const selBooks = (all) => { const b = all || books(); return st.acct === 'all' ? b : b.filter((x) => x.acct.id === st.acct); };
/** Rupees with paise, for cash, charges and prices (hidden like every other figure when figures are masked). */
export const rs2 = (n) => (n == null || isNaN(n) ? '–' : isMasked() ? money(n) : (n < 0 ? '-' : '') + '₹' + dec(Math.abs(n), 2));
/** Runs a change on the Lab part of the data. Shows the reason when it is refused; true when it worked. */
export function run(fn, okMsg) {
  try { commit(fn); if (okMsg) toast(okMsg); return true; } catch (e) { toast(e.message || String(e), 'bad'); return false; }
}
export function download(name, text, type = 'text/csv') {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  document.body.append(a); a.click(); a.remove();
}
export const typeText = BK.typeLabel;
export const ago = (ms) => { const m = Math.round((Date.now() - ms) / 6e4); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' days ago'; };
/** Colour class for a profit or loss figure. */
export const tone = (n) => (n > 0.005 ? 'pos' : n < -0.005 ? 'neg' : '');
export const signedRs = (n) => (n > 0.005 ? '+' : '') + money(n);
export const field = (label, input, hint) => h('label', { class: 'field' }, h('span', null, label), input, hint ? h('small', null, hint) : null);
export const selectOf = (options, value, attrs = {}) => { const s = h('select', attrs); for (const o of options) { const x = typeof o === 'object' ? o : { value: o, label: o }; s.append(h('option', { value: x.value, selected: String(x.value) === String(value) }, x.label)); } return s; };

// ---------- profit and loss display: one look everywhere (green up, red down, an arrow, an explicit sign) ----------
const toneR = (r) => (r > 0.00005 ? 'pos' : r < -0.00005 ? 'neg' : '');
export const arrow = (n) => (n > 0.005 ? '▲' : n < -0.005 ? '▼' : '');
/** Profit or loss in rupees, coloured with an arrow: ▲ +₹1,200 / ▼ -₹800. */
export const plRs = (n) => h('span', { class: 'pl ' + tone(n) }, arrow(n) ? arrow(n) + ' ' : '', signedRs(n));
/** A return as a percentage, coloured with an arrow. `ratio` is 0.052 for 5.2%. */
export const plPct = (ratio, d = 1) => (ratio == null || isNaN(ratio) ? h('span', { class: 'muted' }, '–') : h('span', { class: 'pl ' + toneR(ratio) }, toneR(ratio) ? (ratio > 0 ? '▲ +' : '▼ ') : '', pct(ratio, d)));
/** The same as a tinted pill, for a day's change next to a price. */
export const chg = (ratio, d = 2) => (ratio == null || isNaN(ratio) ? h('span', { class: 'muted' }, '–') : h('span', { class: 'chg ' + toneR(ratio) }, toneR(ratio) ? (ratio > 0 ? '▲ +' : '▼ ') : '', pct(ratio, d)));
/** Rupees and percentage together, the way trading apps show a position's result. */
export const plBoth = (rs, ratio, d = 1) => h('span', { class: 'pl2' }, h('b', { class: tone(rs) }, arrow(rs) ? arrow(rs) + ' ' : '', signedRs(rs)), h('small', { class: toneR(ratio) }, (ratio > 0 ? '+' : '') + pct(ratio, d)));
export const stockHref = (sym) => '#/stock/' + encodeURIComponent(String(sym).toUpperCase());
export const openStock = (sym) => { location.hash = stockHref(sym); };
/** Where a price sits between two levels (52-week low and high): a thin bar with a marker. */
export const rangeBar = (low, high, value) => {
  if (!(low > 0) || !(high > low) || !(value > 0)) return h('span', { class: 'muted' }, '–');
  const p = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return h('span', { class: 'rbar', title: `Low ${dec(low, 2)} · now ${dec(value, 2)} · High ${dec(high, 2)}` }, h('i', { style: { left: (p * 100).toFixed(1) + '%' } }));
};
export const ratioOf = (a, b) => (b > 0 ? a / b - 1 : null);
/** 12,34,56,789 as crores: ₹5,000 Cr. For market capitalisation and other very large figures. */
export const crore = (n) => (n == null || isNaN(n) ? '–' : isMasked() ? '₹ ••••' : n >= 1e7 ? '₹' + Math.round(n / 1e7).toLocaleString('en-IN') + ' Cr' : '₹' + Math.round(n).toLocaleString('en-IN'));
