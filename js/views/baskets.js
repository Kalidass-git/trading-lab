// Trading Lab: baskets. A basket is a set of shares with weights that add up to 100%. Investing an amount buys whole shares in those proportions.
import * as M from '../lab/model.js';
import * as MK from '../lab/market.js';
import { h, money, pct, num, dateStr, section, table, btn, dialog, confirmDialog, toast, empty, rowList } from '../ui.js';
import { LAB, activeAccounts, tone, signedRs, rerender, quote, rs2, run, today, field, selectOf } from './lab-shared.js';
import { snap, accountForm } from './lab-trade.js';

/** Create or edit a basket. Weights are checked live; the basket cannot be saved unless they total 100%. */
function basketForm(bk) {
  const isNew = !bk, rows = (bk ? bk.items : [{ symbol: '', weight: '' }, { symbol: '', weight: '' }]).map((i) => ({ ...i }));
  const name = h('input', { type: 'text', value: bk ? bk.name : '', placeholder: 'e.g. Large-cap core', maxlength: '60' });
  const list = h('div', { class: 'lab-brows' }), tot = h('p', { class: 'lab-total', role: 'status' });
  const draw = () => {
    const sum = rows.reduce((a, r) => a + (Number(r.weight) || 0), 0);
    list.replaceChildren(...rows.map((r, i) => h('div', { class: 'lab-brow' },
      h('input', { type: 'text', value: r.symbol, placeholder: 'Symbol', 'aria-label': 'Share ' + (i + 1), autocapitalize: 'characters', oninput: (e) => { r.symbol = e.target.value.toUpperCase(); } }),
      h('input', { type: 'number', inputmode: 'decimal', min: '0', max: '100', step: 'any', value: r.weight, placeholder: '%', 'aria-label': 'Weight ' + (i + 1), oninput: (e) => { r.weight = e.target.value; recount(); } }),
      h('button', { type: 'button', class: 'icon', 'aria-label': 'Remove', onclick: () => { rows.splice(i, 1); draw(); } }, '✕'))));
    recount();
  };
  const recount = () => { const sum = rows.reduce((a, r) => a + (Number(r.weight) || 0), 0), ok = Math.abs(sum - 100) < 0.005; tot.className = 'lab-total ' + (ok ? 'pos' : 'neg'); tot.textContent = `Total ${M.r2(sum)}%` + (ok ? ' ✓' : sum > 100 ? ` · ${M.r2(sum - 100)}% over` : ` · ${M.r2(100 - sum)}% to go`); };
  draw();
  const body = h('div', { class: 'form' }, field('Basket name', name), h('p', { class: 'mini-title' }, 'Shares and weights'), list,
    h('div', { class: 'row' }, h('button', { type: 'button', class: 'small', onclick: () => { rows.push({ symbol: '', weight: '' }); draw(); } }, 'Add a share'),
      h('button', { type: 'button', class: 'small', onclick: () => { const n = rows.filter((r) => r.symbol.trim()).length; if (!n) return; const w = Math.floor((10000 / n)) / 100; rows.filter((r) => r.symbol.trim()).forEach((r, i, a) => { r.weight = i === a.length - 1 ? M.r2(100 - w * (a.length - 1)) : w; }); draw(); } }, 'Equal weights')), tot);
  const actions = [{ label: 'Cancel', onclick: (c) => c() }];
  if (!isNew) actions.push({ label: 'Delete', class: 'danger', onclick: async (c) => { if (await confirmDialog('Delete this basket? Orders already placed stay in your accounts.', 'Delete')) { if (run((l) => { l.baskets = l.baskets.filter((x) => x.id !== bk.id); }, 'Basket deleted')) { c(); rerender(); } } } });
  actions.push({ label: isNew ? 'Create basket' : 'Save', class: 'primary', onclick: (c) => {
    const nm = name.value.trim(), items = rows.filter((r) => r.symbol.trim() || r.weight !== '').map((r) => ({ symbol: r.symbol.trim().toUpperCase(), weight: Number(r.weight) || 0 }));
    if (!nm) return toast('Give the basket a name.', 'bad');
    if (!items.length) return toast('Add at least one share.', 'bad');
    if (items.some((i) => !/^[A-Z0-9.&^=\-]{1,25}$/.test(i.symbol))) return toast('Every row needs a valid symbol.', 'bad');
    if (new Set(items.map((i) => i.symbol)).size !== items.length) return toast('A share appears twice.', 'bad');
    if (items.some((i) => !(i.weight > 0))) return toast('Every weight must be above zero.', 'bad');
    if (Math.abs(items.reduce((a, i) => a + i.weight, 0) - 100) > 0.005) return toast('Weights must add up to exactly 100%.', 'bad');
    if (LAB().baskets.some((b) => b.name.toLowerCase() === nm.toLowerCase() && (!bk || b.id !== bk.id))) return toast('You already have a basket with this name.', 'bad');
    const old = bk ? new Map(bk.items.map((i) => [i.symbol, i])) : new Map();
    if (run((l) => { const rec = { name: nm, items: items.map((i) => ({ ...i, name: (old.get(i.symbol) || {}).name || '', yahoo: (old.get(i.symbol) || {}).yahoo || '' })) }; if (isNew) l.baskets.push({ id: M.newId('lb'), createdAt: new Date().toISOString(), ...rec }); else Object.assign(l.baskets.find((x) => x.id === bk.id), rec); }, isNew ? 'Basket created' : 'Saved')) { c(); rerender(); MK.refresh(LAB()).then(() => rerender()).catch(() => {}); }
  } });
  dialog(isNew ? 'New basket' : 'Edit ' + bk.name, body, actions);
}

/** Invest an amount in a basket through one account: shows every order before anything is placed. */
function investDialog(bk) {
  const lab = LAB(), accts = activeAccounts(lab);
  if (!accts.length) { toast('Create a trading account first.', 'bad'); return accountForm(); }
  const acct = selectOf(accts.map((a) => ({ value: a.id, label: a.name })), accts[0].id);
  const amt = h('input', { type: 'number', inputmode: 'decimal', min: '0', step: 'any', placeholder: '₹' });
  const date = h('input', { type: 'date', value: today(), max: today() });
  const out = h('div', { class: 'lab-preview' });
  const cur = () => lab.accounts.find((a) => a.id === acct.value);
  const plan = () => M.basketPlan(bk.items, Number(amt.value), quote, cur().fees);
  const draw = () => {
    const cash = M.replay(lab.txns.filter((t) => t.acct === acct.value)).cash, p = plan(), a = Number(amt.value);
    const msgs = p.problems.map((x) => h('p', { class: 'warn' }, x));
    if (a > cash) msgs.push(h('p', { class: 'neg' }, `The account has only ${rs2(cash)} in cash.`));
    out.replaceChildren(...[h('p', { class: 'muted' }, `Cash in ${cur().name}: ${rs2(cash)}`), ...msgs, p.orders.some((o) => o.price) ? table([
      { label: 'Share', host: true, get: (o) => o.symbol }, { label: 'Weight', cls: 'r', mob: 'under', mlabel: '', get: (o) => o.weight + '%' }, { label: 'Price', cls: 'r', get: (o) => (o.price ? rs2(o.price) : '–') },
      { label: 'Quantity', cls: 'r', get: (o) => num(o.qty) }, { label: 'Cost', cls: 'r', get: (o) => rs2(o.total), total: () => rs2(p.spend) }], p.orders, { footer: { label: 'Total', phone: false }, m: { key: 'tl-bplan', head: 'Share', sub: ['Weight'], views: [['Cost', 'Quantity'], ['Price']] } }) : null,
      p.orders.some((o) => o.price) ? h('p', { class: 'summary-line' }, 'Total cost ', h('b', null, rs2(p.spend)), ' · left over ', h('b', null, rs2(p.leftover)), a > 0 ? '' : '') : null].filter(Boolean));
    return { p, cash, a };
  };
  [acct, amt, date].forEach((e) => { e.addEventListener('input', draw); e.addEventListener('change', draw); });
  draw();
  const get = async (b) => { b.disabled = true; try { await MK.refresh(lab); } catch (e) { toast(e.message, 'bad'); } b.disabled = false; draw(); };
  dialog('Invest in ' + bk.name, h('div', { class: 'form' }, field('Account', acct), field('Amount to invest (₹)', amt, 'Whole shares only; what cannot be spent stays as cash.'), field('Date', date),
    h('div', { class: 'row' }, h('button', { type: 'button', class: 'small', onclick: (e) => get(e.currentTarget) }, 'Get latest prices')), out),
    [{ label: 'Cancel', onclick: (c) => c() }, { label: 'Place all orders', class: 'primary', onclick: (c) => {
      const { p, cash, a } = draw();
      if (!p.ok) return toast(p.problems[0] || 'Nothing to buy with this amount.', 'bad');
      if (a > cash || p.spend > cash) return toast('Not enough cash in this account.', 'bad');
      const batch = M.newId('bt');
      if (run((l) => { for (const o of p.orders) if (o.qty > 0) M.addTxn(l, { acct: acct.value, type: 'buy', date: date.value, symbol: o.symbol, name: o.name || o.symbol, yahoo: o.yahoo, qty: o.qty, price: o.price, fees: o.fees, basket: bk.id, batch, note: 'Basket: ' + bk.name }); }, 'Basket bought')) { c(); snap(); rerender(); }
    } }]);
}

/** Sell everything that came from this basket, at the last saved prices. */
async function exitBasket(bk) {
  const lab = LAB(), q = new Map();   // account -> symbol -> quantity still open from this basket
  for (const t of lab.txns.filter((x) => x.basket === bk.id)) { const m = q.get(t.acct) || new Map(); m.set(t.symbol, (m.get(t.symbol) || 0) + (t.type === 'buy' ? Number(t.qty) : -Number(t.qty))); q.set(t.acct, m); }
  const orders = [];
  for (const [acct, m] of q) { const a = lab.accounts.find((x) => x.id === acct); for (const [sym, qty] of m) { if (qty <= 0) continue; const px = quote(sym); if (!px || !(px.price > 0)) return toast(`No price for ${sym}. Refresh prices first.`, 'bad'); orders.push({ acct, symbol: sym, qty, price: px.price, fees: M.feeFor(a.fees, qty * px.price) }); } }
  if (!orders.length) return toast('Nothing left to sell in this basket.');
  if (!(await confirmDialog(`Sell ${orders.length} position${orders.length === 1 ? '' : 's'} from “${bk.name}” at the last saved prices?`, 'Sell all'))) return;
  const batch = M.newId('bt');
  if (run((l) => { for (const o of orders) M.addTxn(l, { acct: o.acct, type: 'sell', date: today(), symbol: o.symbol, qty: o.qty, price: o.price, fees: o.fees, basket: bk.id, batch, note: 'Exit basket: ' + bk.name }); }, 'Basket sold')) { snap(); rerender(); }
}

export function render() {
  const lab = LAB(), root = h('div', { class: 'page' });
  if (!lab.baskets.length) { root.append(h('div', { class: 'card lab-empty' }, h('h2', null, 'Baskets'), h('p', null, 'A basket is a mix of shares with weights, for example 40% / 30% / 30%. Enter an amount and the app works out how many shares of each to buy.'), btn('New basket', () => basketForm(null), 'primary'))); return root; }
  const stats = lab.baskets.map((b) => ({ b, s: M.basketStats(lab, b.id, quote) }));
  root.append(section('Baskets', h('div', null, table([
    { label: 'Basket', host: true, render: (r) => h('span', null, r.b.name, h('small', { class: 'sub' }, ` ${r.b.items.length} shares`)) },
    { label: 'Invested', cls: 'r', get: (r) => money(r.s.invested) }, { label: 'Value now', cls: 'r', render: (r) => money(r.s.value + (r.s.open ? 0 : 0)) },
    { label: 'P&L · Return', cls: 'r', render: (r) => (r.s.orders ? h('div', null, h('div', { class: 'b ' + tone(r.s.pnl) }, signedRs(r.s.pnl)), h('div', { class: 'sub2 ' + tone(r.s.pnl) }, (r.s.ret > 0 ? '+' : '') + pct(r.s.ret, 1))) : h('span', { class: 'muted' }, 'not invested')) },
  ], stats, { onRow: (r) => openBasket(r.b), empty: 'No baskets.', m: { key: 'tl-baskets', head: 'Basket', views: [['P&L · Return', 'Invested'], ['Value now']] } }),
    h('p', { class: 'note' }, 'Tap a basket to see its shares, invest an amount, edit or sell it. Performance counts only orders placed through the basket.')),
    [btn('New basket', () => basketForm(null), 'primary')]));
  return root;
}
function openBasket(bk) {
  const lab = LAB(), s = M.basketStats(lab, bk.id, quote);
  dialog(bk.name, h('div', null,
    rowList(bk.items.map((i) => { const q = quote(i.symbol); return { title: i.symbol, sub: q && q.price > 0 ? rs2(q.price) : 'no price yet', value: i.weight + '%' }; })),
    s.orders ? h('p', { class: 'summary-line' }, 'Invested ', h('b', null, money(s.invested)), ' · worth ', h('b', null, money(s.value)), ' · P&L ', h('b', { class: tone(s.pnl) }, signedRs(s.pnl)), s.unpriced ? h('span', { class: 'warn' }, ` (${s.unpriced} without a price)`) : null) : h('p', { class: 'note' }, 'Not invested yet.')),
    [{ label: 'Edit', onclick: (c) => { c(); basketForm(bk); } }, ...(s.open ? [{ label: 'Sell all', class: 'danger', onclick: (c) => { c(); exitBasket(bk); } }] : []), { label: 'Invest', class: 'primary', onclick: (c) => { c(); investDialog(bk); } }]);
}
