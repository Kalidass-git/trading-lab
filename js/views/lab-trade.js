// Trading Lab: the trade ticket (one sheet used everywhere), account forms and the cash movements.
import * as M from '../lab/model.js';
import * as MK from '../lab/market.js';
import * as BK from '../lab/book.js';
import * as HS from '../lab/history.js';
import { h, dialog, confirmDialog, formDialog, money, num, dec, toast, btn } from '../ui.js';
import { LAB, st, setAcct, quote, today, activeAccounts, run, rs2, field, selectOf, rerender, ago, chg, plRs, rangeBar, crore } from './lab-shared.js';

/** Writes the day's reading for every account (the chart history), only when something changed. Called after a refresh and after each trade. */
export const snap = () => { try { if (BK.snapsNeeded(LAB(), quote, Date.now())) run((lab) => { BK.upsertSnaps(lab, quote, Date.now()); }); } catch { /* a reading is optional */ } };

/** Symbols the owner already uses in the Lab, for the suggestions list. */
function knownSymbols(lab) {
  const m = new Map();
  for (const t of lab.txns) if (t.symbol && !M.isOpt(t.type)) m.set(t.symbol, t.name || t.symbol);
  for (const w of lab.watchlists || []) for (const i of w.items || []) m.set(i.symbol, i.name || i.symbol);
  return m;
}

const kids = (a) => a.filter((x) => x != null && x !== false);   // replaceChildren turns null into the text "null"
const memo = {};   // trade-panel inputs kept per share, so a redraw of the page never wipes what was typed

/**
 * The trade panel: everything needed to buy or sell one share in one place, with the order checked live by the same rules that will save it.
 * It never fetches anything by itself: prices and history load only when "Get price" / "Load price history" is pressed.
 * opts = { side, acct, symbol, name, yahoo, basket, price, pick (show a symbol box), restore, onPlaced }.
 * Returns { el, setSymbol(symbol, name, yahoo), setSide(side) }.
 */
export function tradePanel(opts = {}) {
  const lab = LAB(), accts = activeAccounts(lab);
  const root = h('div', { class: 'trade-panel' });
  if (!accts.length) { root.append(h('p', { class: 'muted' }, 'Create a trading account to place orders.'), btn('New trading account', () => accountForm(), 'primary')); return { el: root, setSymbol() {}, setSide() {} }; }
  let sym0 = opts.symbol ? String(opts.symbol).toUpperCase() : '';
  const mem = opts.restore && memo[sym0] ? memo[sym0] : {};
  let side = mem.side || opts.side || 'buy', name = opts.name || '', yahoo = opts.yahoo || '', mode = mem.mode || 'qty', priceMode = mem.priceMode || (opts.price ? 'custom' : 'mkt'), feesTouched = !!mem.feesTouched, busy = false;
  const acct0 = mem.acct || opts.acct || (st.acct !== 'all' && accts.some((a) => a.id === st.acct) ? st.acct : accts[0].id);
  const sym = h('input', { type: 'text', value: sym0, placeholder: 'Share or index, e.g. RELIANCE', autocomplete: 'off', autocapitalize: 'characters', list: 'lab-syms', 'aria-label': 'Share symbol' });
  const dl = h('datalist', { id: 'lab-syms' }, [...knownSymbols(lab)].map(([k, v]) => h('option', { value: k }, v)));
  const acctSel = selectOf(accts.map((a) => ({ value: a.id, label: a.name })), acct0, { 'aria-label': 'Account' });
  const qty = h('input', { type: 'number', inputmode: 'numeric', min: '1', step: '1', placeholder: 'Qty', value: mem.qty || '', 'aria-label': 'Quantity' });
  const amt = h('input', { type: 'number', inputmode: 'decimal', min: '0', step: 'any', placeholder: '₹ amount', value: mem.amt || '', 'aria-label': 'Amount in rupees' });
  const price = h('input', { type: 'number', inputmode: 'decimal', min: '0', step: 'any', value: mem.custom || opts.price || '', 'aria-label': 'Your price' });
  const fees = h('input', { type: 'number', inputmode: 'decimal', min: '0', step: 'any', value: mem.fees || '', 'aria-label': 'Charges' });
  const date = h('input', { type: 'date', value: mem.date || today(), max: today(), 'aria-label': 'Order date' });
  const note = h('input', { type: 'text', placeholder: 'Why this trade? (optional, shows up in your insights)', maxlength: '200', value: mem.note || '', 'aria-label': 'Note' });
  const sideBox = h('div', { class: 'tp-side', role: 'tablist', 'aria-label': 'Buy or sell' });
  const info = h('div', { class: 'tp-info' }), pos = h('div', { class: 'tp-pos' }), chips = h('div', { class: 'tp-chips' }), prev = h('div', { class: 'tp-prev', role: 'status', 'aria-live': 'polite' }), go = h('button', { type: 'button', class: 'tp-go' });
  const more = h('details', { class: 'tp-more', open: mem.open ? '' : null }, h('summary', null, 'Date, charges and note'), h('div', { class: 'tp-two' }, field('Order date', date), field('Charges (₹)', fees, 'Filled from the account’s charge settings.')), field('Note', note));
  const qtyField = field('Quantity', qty), amtField = field('Amount to invest (₹)', amt, 'Whole shares only; the rest stays as cash.'), priceField = field('Your price (₹)', price);
  const modeBtn = h('button', { type: 'button', class: 'tp-link', onclick: () => { mode = mode === 'qty' ? 'amt' : 'qty'; draw(); } });
  const priceBtn = h('button', { type: 'button', class: 'tp-link', onclick: () => { priceMode = priceMode === 'mkt' ? 'custom' : 'mkt'; if (priceMode === 'custom' && !price.value && effMarket()) price.value = effMarket(); draw(); } });
  const symbol = () => sym.value.trim().toUpperCase();
  const acct = () => lab.accounts.find((a) => a.id === acctSel.value);
  const ledger = () => lab.txns.filter((t) => t.acct === acctSel.value);
  const isPast = () => !!date.value && date.value < today();
  const quoteNow = () => { const q = quote(symbol()); return q && q.price > 0 ? q : null; };
  /** The market price for the chosen date: the live price for today, the saved close for an earlier day (never today's price for a past date). */
  const effMarket = () => { if (isPast()) return HS.closeOn(symbol(), date.value); const q = quoteNow(); return q ? q.price : null; };
  const effPrice = () => (priceMode === 'custom' ? Number(price.value) : effMarket());
  const buy = () => side === 'buy';
  const budgetQty = (budget, p) => { let q = Math.floor(budget / p); while (q > 0 && M.r2(q * p) + M.feeFor(acct().fees, q * p) > budget + 1e-9) q--; return q; };
  const effQty = () => { const p = effPrice(); if (mode === 'amt') { const a = Number(amt.value); return a > 0 && p > 0 ? (buy() ? budgetQty(a, p) : Math.floor(a / p)) : 0; } return Math.round(Number(qty.value)) === Number(qty.value) ? Number(qty.value) : 0; };
  const heldQty = () => { const p = M.replay(ledger()).holdings.find((x) => x.symbol === symbol()); return p || null; };
  const cashNow = () => (isPast() ? M.cashOn(ledger(), date.value) : M.replay(ledger()).cash);
  const remember = () => { if (symbol()) memo[symbol()] = { side, mode, qty: qty.value, amt: amt.value, priceMode, custom: price.value, date: date.value, note: note.value, acct: acctSel.value, fees: feesTouched ? fees.value : '', feesTouched, open: more.open }; };
  /** Runs the order through the real rules without saving it: the reason it would be refused, or '' when it would go through. */
  const dryRun = (q, p) => { try { const t = M.normalise({ acct: acctSel.value, type: side, date: date.value, symbol: symbol(), name: name || symbol(), yahoo, qty: q, price: p, fees: Number(fees.value) || 0 }); const rp = M.replay(ledger().concat([t])); return rp.errors[0] || ''; } catch (e) { return e.message; } };
  const fetchWith = async (fn, b) => { if (busy) return; busy = true; b.disabled = true; const was = b.textContent; b.textContent = 'Getting…'; try { await fn(); } catch (e) { toast(e.message, 'bad'); } busy = false; b.disabled = false; b.textContent = was; draw(); };
  const getPrice = (b) => fetchWith(async () => { const s = symbol(); if (!s) throw new Error('Enter a share first.'); await MK.refresh(LAB(), [{ symbol: s, yahoo }], { only: true }); if (!MK.quoteOf(s)) toast(`No price found for ${s}. Use “My price”.`, 'bad'); }, b);
  const getHistory = (b) => fetchWith(async () => { const s = symbol(); if (!s) throw new Error('Enter a share first.'); await HS.load(s, { yahoo, fundamentals: false }); if (!HS.closeOn(s, date.value)) toast(`No price for ${s} on ${date.value}. Try another date or “My price”.`, 'bad'); }, b);
  const row = (l, v, c) => h('div', { class: 'lp-row' }, h('span', null, l), h('b', { class: c || '' }, v));

  const draw = () => {
    const a = acct(), s = symbol(), q = quoteNow(), mk = effMarket(), p = effPrice(), n = effQty(), pastNoHist = isPast() && mk == null && priceMode === 'mkt', fd = (HS.dataOf(s) || {}).fund;
    sideBox.replaceChildren(...[['buy', 'Buy'], ['sell', 'Sell']].map(([k, l]) => h('button', { type: 'button', role: 'tab', class: 'tp-s ' + k + (side === k ? ' on' : ''), 'aria-selected': String(side === k), onclick: () => { side = k; feesTouched = false; draw(); } }, l)));
    // quote block
    const ageText = q && q.ts ? 'price ' + ago(q.ts) : '';
    info.replaceChildren(...kids(s ? [
      h('div', { class: 'tp-name' }, h('b', null, name || s), name && name !== s ? h('small', null, ' ' + s) : null),
      h('div', { class: 'tp-ltp' }, h('span', { class: 'tp-price' }, q ? rs2(q.price) : '–'), q && q.prevClose > 0 ? chg(q.price / q.prevClose - 1) : null, h('small', { class: 'muted' }, ageText), h('button', { type: 'button', class: 'small tp-get', onclick: (e) => getPrice(e.currentTarget) }, q ? 'Refresh price' : 'Get price')),
      q && (q.dayLow || q.high52) ? h('div', { class: 'tp-facts' },
        q.dayLow && q.dayHigh ? h('span', null, 'Day ', h('b', null, `${dec(q.dayLow, 2)} – ${dec(q.dayHigh, 2)}`)) : null,
        q.low52 && q.high52 ? h('span', { class: 'tp-52' }, '52w ', h('b', null, `${dec(q.low52, 2)} – ${dec(q.high52, 2)}`), rangeBar(q.low52, q.high52, q.price)) : null,
        q.prevClose ? h('span', null, 'Prev ', h('b', null, dec(q.prevClose, 2))) : null,
        fd && fd.pe ? h('span', null, 'P/E ', h('b', null, dec(fd.pe, 1))) : null, fd && fd.marketCap ? h('span', null, 'Mkt cap ', h('b', null, crore(fd.marketCap))) : null) : (q ? h('div', { class: 'tp-facts muted' }, 'Press Refresh price to add the day range and 52-week range.') : null),
    ] : [h('p', { class: 'muted' }, 'Type a share symbol above to see its price and place an order.')]));
    const hp = s ? heldQty() : null;
    pos.replaceChildren(...kids(s ? [h('span', null, 'Cash in ', h('b', null, a.name), ' ', h('b', null, rs2(cashNow())), isPast() ? h('small', { class: 'muted' }, ' on ' + date.value) : null),
      hp ? h('span', null, 'You hold ', h('b', null, num(hp.qty)), ' @ avg ', h('b', null, rs2(hp.avg)), q ? [' · ', plRs(hp.qty * q.price - hp.cost)] : null) : h('span', { class: 'muted' }, 'You hold none')] : []));
    // quantity / amount
    qtyField.style.display = mode === 'qty' ? '' : 'none'; amtField.style.display = mode === 'amt' ? '' : 'none'; priceField.style.display = priceMode === 'custom' ? '' : 'none';
    modeBtn.textContent = mode === 'qty' ? 'Enter an amount instead' : 'Enter a quantity instead';
    priceBtn.textContent = priceMode === 'mkt' ? 'Use my own price' : 'Use the market price';
    if (!feesTouched) fees.value = n > 0 && p > 0 ? M.feeFor(a.fees, n * p) : '';
    // quick amounts: share of the cash for a buy, share of the holding for a sell
    const quick = [];
    if (s && p > 0) {
      for (const f of [0.25, 0.5, 0.75, 1]) {
        const qn = buy() ? budgetQty(cashNow() * f, p) : hp ? (f === 1 ? hp.qty : Math.max(0, Math.floor(hp.qty * f))) : 0;
        if (qn > 0) quick.push(h('button', { type: 'button', class: 'tp-chip', title: `${num(qn)} shares`, onclick: () => { mode = 'qty'; qty.value = qn; draw(); } }, f === 1 ? (buy() ? 'Max' : 'All') : Math.round(f * 100) + '%'));
      }
    }
    chips.replaceChildren(...quick, ...(quick.length ? [h('small', { class: 'muted' }, buy() ? 'of cash' : 'of holding')] : []));
    // preview
    const notes = [];
    let problem = '', ready = false;
    if (!s) { prev.replaceChildren(); }
    else if (pastNoHist) {
      prev.replaceChildren(h('div', { class: 'tp-note warn' }, h('p', null, `The price on ${date.value} is not saved. Today’s price would be wrong for that day.`), h('div', { class: 'row' }, h('button', { type: 'button', class: 'small', onclick: (e) => getHistory(e.currentTarget) }, 'Load price history'), h('button', { type: 'button', class: 'small', onclick: () => { priceMode = 'custom'; draw(); } }, 'Use my price'))));
    } else if (!(p > 0)) {
      prev.replaceChildren(h('p', { class: 'muted' }, priceMode === 'custom' ? 'Enter your price.' : 'There is no saved price yet. Press Get price, or use your own price.'));
    } else if (!(n > 0)) {
      prev.replaceChildren(h('p', { class: 'muted' }, mode === 'amt' ? 'The amount is too small for one share at this price.' : 'Enter a quantity, or tap a quick amount.'));
    } else {
      const o = M.orderPreview(side, n, p, Number(fees.value) || 0), cash = cashNow(), after = buy() ? cash - o.total : cash + o.total;
      problem = dryRun(n, p); ready = !problem;
      if (isPast() && priceMode === 'mkt') notes.push(h('p', { class: 'tp-hint' }, `Using the close on ${HS.candleOn(s, date.value) ? date.value : 'the last trading day before ' + date.value}: ${rs2(p)}.`));
      const start = M.startDate(ledger());
      if (problem && start && date.value < start) notes.push(h('div', { class: 'tp-note warn' }, h('p', null, `This account’s money starts on ${start}, so nothing can be bought before then.`), h('button', { type: 'button', class: 'small', onclick: () => { if (run((l) => { M.moveStart(l, acctSel.value, date.value); }, 'Account now starts on ' + date.value)) { snap(); rerender(); } } }, `Start this account on ${date.value}`)));
      else if (problem && buy() && /not enough cash/.test(problem)) notes.push(h('div', { class: 'tp-note bad' }, h('p', null, problem), h('button', { type: 'button', class: 'small', onclick: () => cashForm(acctSel.value, 'deposit') }, 'Add money to this account')));
      else if (problem) notes.push(h('div', { class: 'tp-note bad' }, h('p', null, problem)));
      prev.replaceChildren(...[row('Quantity × price', `${num(n)} × ${rs2(p)}`), row('Order value', rs2(o.gross)), row('Charges', rs2(o.fees)), row(buy() ? 'Cash needed' : 'Cash received', rs2(o.total)), row('Cash after', rs2(after), after < 0 ? 'neg' : ''),
        mode === 'amt' && Number(amt.value) > 0 ? row('Left over from your amount', rs2(Number(amt.value) - o.total)) : null, ...notes].filter(Boolean));
    }
    go.className = 'tp-go ' + side; go.disabled = !ready;
    go.textContent = ready ? `${buy() ? 'Buy' : 'Sell'} ${num(n)} × ${s} · ${rs2(M.orderPreview(side, n, p, Number(fees.value) || 0).total)}` : `${buy() ? 'Buy' : 'Sell'}${s ? ' ' + s : ''}`;
    root.classList.toggle('is-sell', !buy());
    remember();
  };
  go.addEventListener('click', () => {
    const n = effQty(), p = effPrice();
    if (!symbol()) return toast('Choose a share.', 'bad');
    if (!(p > 0)) return toast('There is no price for this order.', 'bad');
    const ok = run((l) => { M.addTxn(l, { acct: acctSel.value, type: side, date: date.value, symbol: symbol(), name: name || symbol(), yahoo, qty: n, price: p, fees: Number(fees.value) || 0, note: note.value, basket: opts.basket }); }, `${buy() ? 'Bought' : 'Sold'} ${num(n)} ${symbol()}`);
    if (ok) { delete memo[symbol()]; snap(); if (opts.onPlaced) opts.onPlaced(); else rerender(); }
  });
  const fill = () => { const k = knownSymbols(lab).get(symbol()); name = k || (symbol() === sym0 ? opts.name || '' : ''); const w = HS.dataOf(symbol()); if (w && w.fund && w.fund.name && !k) name = w.fund.name; };
  [acctSel, qty, amt, price, date, note].forEach((e) => { e.addEventListener('input', () => { if (e === acctSel) feesTouched = false; if (e === qty) mode = 'qty'; draw(); }); e.addEventListener('change', draw); });
  sym.addEventListener('input', () => { fill(); draw(); });
  fees.addEventListener('input', () => { feesTouched = true; draw(); });
  more.addEventListener('toggle', remember);
  root.append(...kids([dl, sideBox, opts.pick ? h('label', { class: 'field tp-symfield' }, h('span', null, 'Share'), sym) : null, info, accts.length > 1 ? field('Account', acctSel) : null, pos,
    qtyField, amtField, h('div', { class: 'tp-qrow' }, chips, modeBtn), priceField, h('div', { class: 'tp-qrow' }, priceBtn), more, prev, go]));
  draw();
  return { el: root, setSymbol(s, n, y) { sym.value = s; name = n || ''; yahoo = y || ''; sym0 = String(s).toUpperCase(); fill(); draw(); }, setSide(k) { side = k; feesTouched = false; draw(); root.scrollIntoView({ block: 'nearest' }); }, focusQty() { qty.focus(); } };
}

/**
 * The trade panel in a pop-up, for orders started from anywhere (Buy / Sell buttons, watchlists, baskets).
 * opts = { side, acct, symbol, name, yahoo, basket, price, title }.
 */
export function ticket(opts = {}) {
  const lab = LAB(), accts = activeAccounts(lab);
  if (!accts.length) { toast('Create a trading account first.', 'bad'); return accountForm(); }
  let d;
  const panel = tradePanel({ ...opts, pick: !opts.symbol, onPlaced: () => { d.close(); rerender(); } });
  d = dialog(opts.title || (opts.symbol ? `${opts.side === 'sell' ? 'Sell' : 'Buy'} ${opts.symbol}` : 'Buy / sell'), panel.el, []);
  d.el.classList.add('trade-dialog');
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
      { key: 'start', label: 'Account start date', type: 'date', required: true, hint: 'The date the money arrives. Trades can be dated from this day on, so pick an earlier date to practise back-dated trades.' },
      { key: 'brokeragePct', label: 'Brokerage (% of order value)', type: 'number', half: true, hint: 'Optional. 0 means no brokerage.' }, { key: 'flat', label: 'Flat fee per order (₹)', type: 'number', half: true },
      { key: 'otherPct', label: 'Other charges (% of order value)', type: 'number', hint: 'Taxes and levies together, for example 0.1.' },
    ], value: { name: acct ? acct.name : '', capital: '', start: isNew ? today() : M.startDate(lab.txns.filter((t) => t.acct === acct.id)) || today(), brokeragePct: fees.brokeragePct ?? '', flat: fees.flat ?? '', otherPct: fees.otherPct ?? '' },
    onSave: (v) => {
      const nm = (v.name || '').trim();
      if (lab.accounts.some((a) => a.name.toLowerCase() === nm.toLowerCase() && (!acct || a.id !== acct.id))) { toast('You already have an account with this name.', 'bad'); return false; }
      const f = { brokeragePct: Math.max(0, v.brokeragePct || 0), flat: Math.max(0, v.flat || 0), otherPct: Math.max(0, v.otherPct || 0) };
      let newId;
      if (!run((l) => {
        if (isNew) { if (!(v.capital > 0)) throw new Error('Starting capital must be above zero.'); newId = M.newId('la'); l.accounts.push({ id: newId, name: nm, createdAt: new Date().toISOString(), archived: false, fees: f }); if (!v.start || v.start > today()) throw new Error('The start date cannot be in the future.'); M.addTxn(l, { acct: newId, type: 'deposit', date: v.start, amount: v.capital, note: 'Starting capital' }); }
        else { const a = l.accounts.find((x) => x.id === acct.id); a.name = nm; a.fees = f; const cur = M.startDate(l.txns.filter((t) => t.acct === a.id)); if (v.start && cur && v.start !== cur) { if (v.start > today()) throw new Error('The start date cannot be in the future.'); M.moveStart(l, a.id, v.start); } }
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
