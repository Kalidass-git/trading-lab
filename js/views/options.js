// Trading Lab: options. Buy calls and puts, track premium, expiry and profit. Premiums are typed by you or estimated (Black-Scholes) from the live price of the underlying.
import * as M from '../lab/model.js';
import * as O from '../lab/options.js';
import * as MK from '../lab/market.js';
import * as T from '../lab/time.js';
import { h, money, pct, num, dateStr, section, table, btn, dialog, formDialog, rowList, toast, confirmDialog } from '../ui.js';
import { LAB, selBooks, activeAccounts, tone, signedRs, rerender, quote, rs2, run, today, field, selectOf } from './lab-shared.js';
import { snap, accountForm } from './lab-trade.js';

const INDEX = { NIFTY: '^NSEI', BANKNIFTY: '^NSEBANK', SENSEX: '^BSESN' };
const SRC = { manual: 'you entered', model: 'estimated', intrinsic: 'at expiry' };
const spotOf = (u) => { const q = quote(u); return q && q.price > 0 ? q.price : null; };
const yahooOf = (u) => INDEX[String(u).toUpperCase()] || '';

/** Buy a call or put. Quantity is in lots; the preview shows cost and the break-even level. */
export function optionTicket(pre = {}) {
  const lab = LAB(), accts = activeAccounts(lab);
  if (!accts.length) { toast('Create a trading account first.', 'bad'); return accountForm(); }
  const acct = selectOf(accts.map((a) => ({ value: a.id, label: a.name })), pre.acct || accts[0].id);
  const side = selectOf([{ value: 'obuy', label: 'Buy (open)' }, { value: 'osell', label: 'Sell (close)' }], pre.side || 'obuy');
  const und = h('input', { type: 'text', value: pre.underlying || '', placeholder: 'NIFTY, BANKNIFTY or a share', autocapitalize: 'characters', list: 'lab-und' });
  const dl = h('datalist', { id: 'lab-und' }, Object.keys(INDEX).map((k) => h('option', { value: k })));
  const kind = selectOf([{ value: 'call', label: 'Call (CE)' }, { value: 'put', label: 'Put (PE)' }], pre.kind || 'call');
  const strike = h('input', { type: 'number', inputmode: 'decimal', min: '0', step: 'any', value: pre.strike || '' });
  const expiry = h('input', { type: 'date', value: pre.expiry || '' });
  const lot = h('input', { type: 'number', inputmode: 'numeric', min: '1', step: '1', value: pre.lot || '', placeholder: 'e.g. 75' });
  const lots = h('input', { type: 'number', inputmode: 'numeric', min: '1', step: '1', value: pre.lots || 1 });
  const prem = h('input', { type: 'number', inputmode: 'decimal', min: '0', step: 'any', value: pre.premium || '' });
  const fees = h('input', { type: 'number', inputmode: 'decimal', min: '0', step: 'any' });
  const date = h('input', { type: 'date', value: today(), max: today() });
  const prev = h('div', { class: 'lab-preview', role: 'status' }), info = h('small', { class: 'muted' });
  let touched = false;
  const a = () => lab.accounts.find((x) => x.id === acct.value), u = () => und.value.trim().toUpperCase(), q = () => Math.round(Number(lots.value) * Number(lot.value));
  const pos = () => ({ underlying: u(), kind: kind.value, strike: Number(strike.value), expiry: expiry.value });
  const estimate = () => { const p = pos(), spot = spotOf(u()); if (!spot || !(p.strike > 0) || !p.expiry) return null; return O.optionPremium(p, spot, null, lab.settings, Date.now()); };
  const draw = () => {
    const qty = q(), p = Number(prem.value), buy = side.value === 'obuy', est = estimate(), spot = spotOf(u());
    info.textContent = spot ? `${u()} is at ${rs2(spot)}` + (est ? ` · estimate ${rs2(est.premium)} a unit` : '') : u() ? `No saved price for ${u()}. Press “Get price”.` : '';
    if (!touched) fees.value = qty > 0 && p > 0 ? M.feeFor(a().fees, qty * p) : '';
    if (!(qty > 0) || !(p >= 0) || prem.value === '') { prev.replaceChildren(h('p', { class: 'muted' }, 'Enter the contract and premium to see the cost.')); return; }
    const o = M.orderPreview(buy ? 'buy' : 'sell', qty, p, Number(fees.value) || 0), cash = M.replay(lab.txns.filter((t) => t.acct === a().id)).cash;
    const row = (l, v, c) => h('div', { class: 'lp-row' }, h('span', null, l), h('b', { class: c || '' }, v));
    prev.replaceChildren(...[row('Quantity', `${num(Number(lots.value))} lot${Number(lots.value) === 1 ? '' : 's'} × ${num(Number(lot.value))} = ${num(qty)}`), row('Premium value', rs2(o.gross)), row('Charges', rs2(o.fees)), row(buy ? 'Cash needed' : 'Cash received', rs2(o.total)), row('Cash after', rs2(buy ? cash - o.total : cash + o.total), (buy ? cash - o.total : 0) < 0 ? 'neg' : ''),
      buy && Number(strike.value) > 0 ? row('Break-even at expiry', rs2(O.breakeven(kind.value, Number(strike.value), p))) : null,
      buy ? row('Most you can lose', rs2(o.total)) : null].filter(Boolean));
  };
  [acct, side, und, kind, strike, expiry, lot, lots, prem, date].forEach((e) => { e.addEventListener('input', () => { if (e === acct || e === side) touched = false; draw(); }); e.addEventListener('change', draw); });
  fees.addEventListener('input', () => { touched = true; draw(); });
  const getPrice = async (b) => { if (!u()) return toast('Enter the underlying first.', 'bad'); b.disabled = true; try { await MK.refresh(lab, [{ symbol: u(), yahoo: yahooOf(u()) }]); if (!spotOf(u())) toast('No price found for ' + u() + '.', 'bad'); } catch (e) { toast(e.message, 'bad'); } b.disabled = false; draw(); };
  const fill = () => { const e = estimate(); if (!e) return toast('Needs the underlying’s price, strike and expiry.', 'bad'); prem.value = e.premium; touched = false; draw(); };
  draw();
  dialog(pre.title || 'Option ticket', h('div', { class: 'form lab-ticket' }, dl,
    h('div', { class: 'lab-two' }, field('Account', acct), field('Order', side)), field('Underlying', und), h('div', { class: 'lab-get' }, info, h('button', { type: 'button', class: 'small', onclick: (e) => getPrice(e.currentTarget) }, 'Get price')),
    h('div', { class: 'lab-two' }, field('Type', kind), field('Strike', strike)), h('div', { class: 'lab-two' }, field('Expiry', expiry), field('Lot size', lot)),
    h('div', { class: 'lab-two' }, field('Lots', lots), field('Premium per unit (₹)', prem)), h('div', { class: 'lab-get' }, h('small', { class: 'muted' }, 'Type the premium you paid, or use an estimate.'), h('button', { type: 'button', class: 'small', onclick: fill }, 'Use estimate')),
    h('div', { class: 'lab-two' }, field('Charges (₹)', fees), field('Date', date)), prev), [
      { label: 'Cancel', onclick: (c) => c() },
      { label: 'Place order', class: 'primary', onclick: (c) => {
        const qty = q(), p = Number(prem.value);
        if (!(Number(lot.value) >= 1)) return toast('Enter the lot size.', 'bad');
        if (!(Number(lots.value) >= 1) || Math.round(Number(lots.value)) !== Number(lots.value)) return toast('Lots must be a whole number.', 'bad');
        if (prem.value === '' || !(p > 0)) return toast('Enter the premium.', 'bad');
        const ok = run((l) => { M.addTxn(l, { acct: acct.value, type: side.value, date: date.value, qty, price: p, fees: Number(fees.value) || 0, opt: { underlying: u(), yahoo: yahooOf(u()), kind: kind.value, strike: Number(strike.value), expiry: expiry.value, lot: Number(lot.value) } }); }, side.value === 'obuy' ? 'Option bought' : 'Option sold');
        if (ok) { c(); snap(); rerender(); }
      } }]);
}

function markForm(p) {
  const lab = LAB(), cur = (lab.marks || []).find((m) => m.id === p.key) || {};
  formDialog({ title: 'Current premium · ' + p.name, saveLabel: 'Save',
    fields: [{ key: 'premium', label: 'Premium now (₹ per unit)', type: 'number', hint: 'From your broker or the option chain. Leave empty to use the estimate.' }, { key: 'iv', label: 'Volatility for the estimate (%)', type: 'number', hint: 'Used only when no premium is entered. Empty uses the default in the page.' }],
    value: { premium: cur.premium ?? '', iv: cur.iv ? cur.iv * 100 : '' },
    onSave: (v) => { if (!run((l) => { l.marks = (l.marks || []).filter((m) => m.id !== p.key); if (v.premium > 0 || v.iv > 0) l.marks.push({ id: p.key, premium: v.premium > 0 ? v.premium : null, iv: v.iv > 0 ? v.iv / 100 : null, at: new Date().toISOString() }); }, 'Saved')) return false; snap(); rerender(); } });
}
function settleDialog(p) {
  const spot = spotOf(p.underlying), v = spot ? O.intrinsic(p.kind, spot, p.strike) : 0;
  formDialog({ title: 'Settle expired option', saveLabel: 'Settle',
    fields: [{ key: 'price', label: 'Settlement value per unit (₹)', type: 'number', required: true, hint: `${p.name}. Intrinsic value at today’s ${p.underlying} price is ${rs2(v)}. Enter 0 if it expired worthless.` }, { key: 'date', label: 'Date', type: 'date', required: true }],
    value: { price: Math.round(v * 100) / 100, date: today() },
    onSave: (f) => { if (!run((l) => { M.addTxn(l, { acct: p.acct, type: 'oexp', date: f.date, qty: p.qty, price: f.price ?? 0, fees: 0, opt: { underlying: p.underlying, yahoo: p.yahoo, kind: p.kind, strike: p.strike, expiry: p.expiry, lot: p.lot } }); }, 'Settled')) return false; snap(); rerender(); } });
}
function openPos(p) {
  const left = T.daysToExpiry(p.expiry, Date.now()), expired = T.isExpired(p.expiry, Date.now());
  const sellable = !expired;
  dialog(p.name, h('div', null, rowList([
    { title: 'Contract', sub: `${p.kind === 'call' ? 'Call' : 'Put'} · strike ${num(p.strike)} · lot ${num(p.lot)}`, value: expired ? h('span', { class: 'neg' }, 'Expired') : left === 0 ? h('span', { class: 'warn' }, 'Expires today') : `${left} day${left === 1 ? '' : 's'}`, valueSub: dateStr(p.expiry) },
    { title: 'Position', sub: `${num(p.qty / p.lot)} lot${p.qty / p.lot === 1 ? '' : 's'} · avg premium ${rs2(p.avg)}`, value: num(p.qty) + ' units' },
    { title: 'Premium now', sub: p.premium == null ? 'No price. Enter the premium, or refresh the underlying.' : SRC[p.source] || '', value: p.premium == null ? '–' : rs2(p.premium) },
    { title: 'Value', sub: `paid ${money(p.cost)}`, value: money(p.value) }, { title: 'Profit / loss', value: h('span', { class: tone(p.pnl) }, signedRs(p.pnl)), valueSub: h('span', { class: tone(p.pnl) }, (p.ret > 0 ? '+' : '') + pct(p.ret, 1)) },
    { title: 'Break-even at expiry', value: rs2(O.breakeven(p.kind, p.strike, p.avg)) }]),
    p.source === 'model' ? h('p', { class: 'note' }, 'This value is an estimate from the underlying’s price, time left and the volatility setting. A real option price can differ.') : null),
    [{ label: 'Set premium', onclick: (c) => { c(); markForm(p); } }, ...(expired ? [{ label: 'Settle', class: 'primary', onclick: (c) => { c(); settleDialog(p); } }] : [{ label: 'Close position', class: 'primary', onclick: (c) => { c(); optionTicket({ side: 'osell', acct: p.acct, underlying: p.underlying, kind: p.kind, strike: p.strike, expiry: p.expiry, lot: p.lot, lots: p.qty / p.lot, premium: p.premium || '', title: 'Close ' + p.name }); } }])].concat(sellable ? [] : []));
}
function assumptions() {
  const s = LAB().settings || {};
  formDialog({ title: 'Option pricing assumptions', saveLabel: 'Save',
    fields: [{ key: 'iv', label: 'Default volatility (% a year)', type: 'number', required: true, hint: 'Used to estimate a premium when you have not entered one. 15–25 is typical for index options.' }, { key: 'rate', label: 'Interest rate (% a year)', type: 'number', required: true }],
    value: { iv: Math.round((s.iv || 0.2) * 1000) / 10, rate: Math.round((s.rate ?? 0.07) * 1000) / 10 },
    onSave: (v) => { if (!(v.iv > 0 && v.iv < 300)) { toast('Volatility must be between 0 and 300.', 'bad'); return false; } if (!run((l) => { l.settings = { ...l.settings, iv: v.iv / 100, rate: Math.max(0, v.rate) / 100 }; }, 'Saved')) return false; rerender(); } });
}

export function render() {
  const lab = LAB(), root = h('div', { class: 'page' });
  const sel = selBooks(), rows = [];
  for (const b of sel) for (const p of b.v.options) rows.push({ ...p, acct: b.acct.id, acctName: b.acct.name, days: T.daysToExpiry(p.expiry, Date.now()), expired: T.isExpired(p.expiry, Date.now()) });
  rows.sort((a, b) => (a.expiry < b.expiry ? -1 : 1));
  const tv = rows.reduce((a, r) => a + r.value, 0), tc = rows.reduce((a, r) => a + r.cost, 0);
  root.append(section('Option positions', h('div', null, table([
    { label: 'Contract', host: true, render: (r) => h('span', null, r.name, r.expired ? h('small', { class: 'tag neg' }, 'expired') : null, r.noPrice ? h('small', { class: 'tag' }, 'no price') : null) },
    { label: 'Expiry', cls: 'r', render: (r) => h('div', null, h('div', null, dateStr(r.expiry)), h('div', { class: 'sub2 ' + (r.expired ? 'neg' : r.days <= 3 ? 'warn' : '') }, r.expired ? 'expired' : r.days === 0 ? 'today' : r.days + ' days')) },
    { label: 'Lots · Premium paid', cls: 'r', render: (r) => h('div', null, h('div', null, `${num(r.qty / r.lot)} lot${r.qty / r.lot === 1 ? '' : 's'}`), h('div', { class: 'sub2' }, 'avg ' + rs2(r.avg))) },
    { label: 'Premium now', cls: 'r', render: (r) => h('div', null, h('div', null, r.premium == null ? '–' : rs2(r.premium)), h('div', { class: 'sub2' }, SRC[r.source] || '')) },
    { label: 'Value · Paid', cls: 'r', render: (r) => h('div', null, h('div', { class: 'b' }, money(r.value)), h('div', { class: 'sub2' }, '(' + money(r.cost) + ')')), total: () => money(tv) },
    { label: 'P&L · Return', cls: 'r', render: (r) => h('div', null, h('div', { class: 'b ' + tone(r.pnl) }, signedRs(r.pnl)), h('div', { class: 'sub2 ' + tone(r.pnl) }, (r.ret > 0 ? '+' : '') + pct(r.ret, 1))), total: () => h('span', { class: tone(tv - tc) }, signedRs(tv - tc)) },
  ], rows, { footer: { label: 'Total' }, onRow: openPos, empty: 'No open option positions. Press “Buy option” to open one.',
    m: { key: 'tl-opts', head: 'Contract', sub: ['Expiry'], views: [['P&L · Return', 'Value · Paid'], ['Premium now', 'Lots · Premium paid']] } }),
    h('p', { class: 'note' }, 'Options are bought to open and sold to close (no writing). When no premium is entered, the value is estimated from the underlying’s live price with the Black-Scholes model. After expiry, only the intrinsic value counts: settle the position to book it.')),
    [btn('Buy option', () => optionTicket(), 'primary'), btn('Pricing assumptions', assumptions)]));
  const exp = rows.filter((r) => r.expired);
  if (exp.length) root.append(h('div', { class: 'warn-box' }, h('b', null, `${exp.length} expired option${exp.length === 1 ? '' : 's'} still open`), h('p', null, 'Tap a contract and choose Settle to book its profit or loss.')));
  return root;
}
