// Trading Lab: small helpers shared by its screens.
import { S, commit } from '../store.js';
import * as M from '../lab/model.js';
import * as MK from '../lab/market.js';
import * as BK from '../lab/book.js';
import { istDate } from '../lab/time.js';
import { h, toast, money, dec, isMasked } from '../ui.js';

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
