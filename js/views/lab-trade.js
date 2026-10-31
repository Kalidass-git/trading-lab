// Trading Lab: the trade ticket (one sheet used everywhere), account forms and the cash movements.
import * as M from '../lab/model.js';
import * as MK from '../lab/market.js';
import * as BK from '../lab/book.js';
import { h, dialog, confirmDialog, formDialog, money, num, dec, toast, btn } from '../ui.js';
import { LAB, st, setAcct, quote, today, activeAccounts, run, rs2, field, selectOf, rerender } from './lab-shared.js';

/** Writes the day's reading for every account (the chart history), only when something changed. Called after a refresh and after each trade. */
export const snap = () => { try { if (BK.snapsNeeded(LAB(), quote, Date.now())) run((lab) => { BK.upsertSnaps(lab, quote, Date.now()); }); } catch { /* a reading is optional */ } };

/** Symbols the owner already uses in the Lab, for the suggestions list. */
function knownSymbols(lab) {
  const m = new Map();
  for (const t of lab.txns) if (t.symbol && !M.isOpt(t.type)) m.set(t.symbol, t.name || t.symbol);
  for (const w of lab.watchlists || []) for (const i of w.items || []) m.set(i.symbol, i.name || i.symbol);
  return m;
}

/**
 * The trade ticket. opts = { side: 'buy'|'sell', acct, symbol, name, yahoo, price, basket, kind: 'stock' }.
 * Shows what the order costs and the cash left before anything is saved.
 */
export function ticket(opts = {}) {
  const lab = LAB(), accts = activeAccounts(lab);
  if (!accts.length) { toast('Create a trading account first.', 'bad'); return accountForm(); }
  const acct0 = opts.acct || (st.acct !== 'all' && accts.some((a) => a.id === st.acct) ? st.acct : accts[0].id);
  const sym = h('input', { type: 'text', value: opts.symbol || '', placeholder: 'e.g. RELIANCE', autocomplete: 'off', autocapitalize: 'characters', list: 'lab-syms' });
  const dl = h('datalist', { id: 'lab-syms' }, [...knownSymbols(lab)].map(([k, v]) => h('option', { value: k }, v)));
  const acctSel = selectOf(accts.map((a) => ({ value: a.id, label: a.name })), acct0);
  const sideSel = selectOf([{ value: 'buy', label: 'Buy' }, { value: 'sell', label: 'Sell' }], opts.side || 'buy');
  const modeSel = selectOf([{ value: 'qty', label: 'By quantity' }, { value: 'amt', label: 'By amount' }], 'qty');
  const priceSel = selectOf([{ value: 'mkt', label: 'Market price (last refresh)' }, { value: 'custom', label: 'My price' }], opts.price ? 'custom' : 'mkt');
  const qty = h('input', { type: 'number', inputmode: 'numeric', min: '1', step: '1', placeholder: 'Shares' });
  const amt = h('input', { type: 'number', inputmode: 'decimal', min: '0', step: 'any', placeholder: '₹' });
  const price = h('input', { type: 'number', inputmode: 'decimal', min: '0', step: 'any', value: opts.price || '' });
  const fees = h('input', { type: 'number', inputmode: 'decimal', min: '0', step: 'any' });
  const date = h('input', { type: 'date', value: today(), max: today() });
  const note = h('input', { type: 'text', placeholder: 'Why this trade (optional)', maxlength: '200' });
  const prev = h('div', { class: 'lab-preview', role: 'status', 'aria-live': 'polite' });
  const hint = h('small', { class: 'muted' });
  let feesTouched = false, yahoo = opts.yahoo || '', name = opts.name || '';
  const acct = () => lab.accounts.find((a) => a.id === acctSel.value);
  const symbol = () => sym.value.trim().toUpperCase();
  const mkt = () => { const q = quote(symbol()); return q && q.price > 0 ? q.price : null; };
  const effPrice = () => (priceSel.value === 'custom' ? Number(price.value) : mkt());
  const effQty = () => { const p = effPrice(); if (modeSel.value === 'amt') { const a = Number(amt.value); if (!(a > 0) || !(p > 0)) return 0; let q = Math.floor(a / p); while (q > 0 && sideSel.value === 'buy' && M.r2(q * p) + M.feeFor(acct().fees, q * p) > a + 1e-9) q--; return q; } return Number(qty.value); };
  const held = () => { const a = acct(); const p = M.replay(lab.txns.filter((t) => t.acct === a.id)).holdings.find((x) => x.symbol === symbol()); return p ? p.qty : 0; };
  const draw = () => {
    const a = acct(), p = effPrice(), q = effQty(), buy = sideSel.value === 'buy';
    amt.closest('label').style.display = modeSel.value === 'amt' ? '' : 'none'; qty.closest('label').style.display = modeSel.value === 'amt' ? 'none' : '';
    price.closest('label').style.display = priceSel.value === 'custom' ? '' : 'none';
    const rp = M.replay(lab.txns.filter((t) => t.acct === a.id)), cash = rp.cash;
    if (!feesTouched) fees.value = q > 0 && p > 0 ? M.feeFor(a.fees, q * p) : '';
    hint.textContent = sideSel.value === 'sell' && symbol() ? `You hold ${num(held())} · ` : '';
    hint.textContent += `Cash in ${a.name}: ${rs2(cash)}`;
    if (!symbol()) { prev.replaceChildren(h('p', { class: 'muted' }, 'Choose a share to see the order.')); return; }
    if (!(p > 0)) { prev.replaceChildren(h('p', { class: 'warn' }, priceSel.value === 'custom' ? 'Enter your price.' : `No saved price for ${symbol()}. Press “Get price”, or choose “My price”.`)); return; }
    if (!(q > 0)) { prev.replaceChildren(h('p', { class: 'muted' }, modeSel.value === 'amt' ? 'The amount is too small for one share at this price.' : 'Enter the quantity.')); return; }
    const o = M.orderPreview(sideSel.value, q, p, Number(fees.value) || 0), after = buy ? cash - o.total : cash + o.total;
    const row = (l, v, c) => h('div', { class: 'lp-row' }, h('span', null, l), h('b', { class: c || '' }, v));
    prev.replaceChildren(...[row('Quantity × price', `${num(q)} × ${rs2(p)}`), row('Order value', rs2(o.gross)), row('Charges', rs2(o.fees)), row(buy ? 'Cash needed' : 'Cash received', rs2(o.total)), row('Cash after', rs2(after), after < 0 ? 'neg' : ''),
      modeSel.value === 'amt' && Number(amt.value) > 0 ? row('Left over from your amount', rs2(Number(amt.value) - o.total)) : null].filter(Boolean));
  };
  const getPrice = async (b) => {
    const s = symbol(); if (!s) { toast('Enter a share first.', 'bad'); return; }
    b.disabled = true; const was = b.textContent; b.textContent = 'Getting…';
    try { const r = await MK.refresh(LAB(), [{ symbol: s, yahoo }]); if (!MK.quoteOf(s)) toast(`No price found for ${s}. Use “My price”.`, 'bad'); else if (r.errors.length) toast('Some prices could not be fetched.', ''); } catch (e) { toast(e.message, 'bad'); }
    b.disabled = false; b.textContent = was; draw();
  };
  const fill = () => { const s = symbol(), k = knownSymbols(lab).get(s); if (k && !name) name = k; };
  [sym, acctSel, sideSel, modeSel, priceSel, qty, amt, price, date].forEach((e) => { e.addEventListener('input', () => { if (e === acctSel || e === sideSel) feesTouched = false; if (e === sym) fill(); draw(); }); e.addEventListener('change', draw); });
  fees.addEventListener('input', () => { feesTouched = true; draw(); });
  const body = h('div', { class: 'form lab-ticket' }, dl,
    h('div', { class: 'lab-two' }, field('Account', acctSel), field('Order', sideSel)),
    field('Share', sym), h('div', { class: 'lab-get' }, hint, h('button', { type: 'button', class: 'small', onclick: (e) => getPrice(e.currentTarget) }, 'Get price')),
    h('div', { class: 'lab-two' }, field('Enter', modeSel), field('Price', priceSel)),
    field('Quantity', qty), field('Amount to invest (₹)', amt, 'Whole shares only; the rest stays as cash.'), field('Your price (₹)', price),
    h('div', { class: 'lab-two' }, field('Charges (₹)', fees, 'Filled from the account’s charge settings.'), field('Date', date)),
    field('Note', note), prev);
  draw();
  dialog(opts.title || 'Trade ticket', body, [
    { label: 'Cancel', onclick: (c) => c() },
    { label: 'Place order', class: 'primary', onclick: (c) => {
      const q = effQty(), p = effPrice(), buy = sideSel.value === 'buy';
      if (!symbol()) return toast('Choose a share.', 'bad');
      if (!(p > 0)) return toast('There is no price for this order.', 'bad');
      const ok = run((l) => { M.addTxn(l, { acct: acctSel.value, type: sideSel.value, date: date.value, symbol: symbol(), name: name || symbol(), yahoo, qty: q, price: p, fees: Number(fees.value) || 0, note: note.value, basket: opts.basket }); }, `${buy ? 'Bought' : 'Sold'} ${num(q)} ${symbol()}`);
      if (ok) { c(); snap(); rerender(); }
    } }]);
}

/** Add money to, or take money out of, an account. */
export function cashForm(acctId, type = 'deposit') {
  const lab = LAB(), a = lab.accounts.find((x) => x.id === acctId); if (!a) return;
  formDialog({ title: `${type === 'deposit' ? 'Add money to' : 'Take money from'} ${a.name}`, saveLabel: type === 'deposit' ? 'Add' : 'Withdraw',
    fields: [{ key: 'amount', label: 'Amount (₹)', type: 'number', required: true }, { key: 'date', label: 'Date', type: 'date', required: true }, { key: 'note', label: 'Note (optional)', type: 'text' }], value: { date: today() },
    onSave: (v) => { if (!run((l) => { M.addTxn(l, { acct: a.id, type, date: v.date, amount: v.amount, note: v.note }); }, type === 'deposit' ? 'Money added' : 'Money taken out')) return false; snap(); rerender(); } });
}

/** Create or edit an account. Capital is the first deposit, so it is part of the ledger like everything else. */
export function accountForm(acct) {
  const isNew = !acct, lab = LAB();
  const fees = acct ? acct.fees || {} : {};
  formDialog({ title: isNew ? 'New trading account' : 'Edit ' + acct.name, saveLabel: isNew ? 'Create account' : 'Save',
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      ...(isNew ? [{ key: 'capital', label: 'Starting capital (₹)', type: 'number', required: true, hint: 'Virtual money. It never touches your real accounts.' }] : []),
      { key: 'brokeragePct', label: 'Brokerage (% of order value)', type: 'number', half: true, hint: 'Optional. 0 means no brokerage.' }, { key: 'flat', label: 'Flat fee per order (₹)', type: 'number', half: true },
      { key: 'otherPct', label: 'Other charges (% of order value)', type: 'number', hint: 'Taxes and levies together, for example 0.1.' },
    ], value: { name: acct ? acct.name : '', capital: '', brokeragePct: fees.brokeragePct ?? '', flat: fees.flat ?? '', otherPct: fees.otherPct ?? '' },
    onSave: (v) => {
      const nm = (v.name || '').trim();
      if (lab.accounts.some((a) => a.name.toLowerCase() === nm.toLowerCase() && (!acct || a.id !== acct.id))) { toast('You already have an account with this name.', 'bad'); return false; }
      const f = { brokeragePct: Math.max(0, v.brokeragePct || 0), flat: Math.max(0, v.flat || 0), otherPct: Math.max(0, v.otherPct || 0) };
      let newId;
      if (!run((l) => {
        if (isNew) { if (!(v.capital > 0)) throw new Error('Starting capital must be above zero.'); newId = M.newId('la'); l.accounts.push({ id: newId, name: nm, createdAt: new Date().toISOString(), archived: false, fees: f }); M.addTxn(l, { acct: newId, type: 'deposit', date: today(), amount: v.capital, note: 'Starting capital' }); }
        else { const a = l.accounts.find((x) => x.id === acct.id); a.name = nm; a.fees = f; }
      }, isNew ? 'Account created' : 'Saved')) return false;
      if (isNew) setAcct(newId); snap(); rerender();
    } });
}

export async function deleteAccount(a) {
  if (!(await confirmDialog(`Delete “${a.name}” and all of its mock trades? This cannot be undone. Your real portfolio is not affected.`, 'Delete account'))) return;
  if (run((l) => { l.accounts = l.accounts.filter((x) => x.id !== a.id); l.txns = l.txns.filter((t) => t.acct !== a.id); l.snaps = (l.snaps || []).filter((s) => s.acct !== a.id); }, 'Account deleted')) { if (st.acct === a.id) setAcct('all'); rerender(); }
}
export const setArchived = (a, v) => { if (run((l) => { l.accounts.find((x) => x.id === a.id).archived = v; }, v ? 'Account archived' : 'Account restored')) { if (v && st.acct === a.id) setAcct('all'); rerender(); } };

/** Delete one transaction, only if the rest of the account still adds up (no negative cash or holdings). */
export async function deleteTxn(t) {
  if (!(await confirmDialog(`Delete this ${BK.typeLabel(t.type).toLowerCase()}${t.symbol ? ' of ' + t.symbol : ''} on ${t.date}? The account is recalculated without it.`, 'Delete'))) return;
  if (run((l) => { const rest = l.txns.filter((x) => x.id !== t.id), rp = M.replay(rest.filter((x) => x.acct === t.acct)); if (rp.errors.length) throw new Error('Cannot delete: ' + rp.errors[0]); l.txns = rest; }, 'Deleted')) { snap(); rerender(); }
}
