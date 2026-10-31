// Trading Lab: Stocks (holdings, watchlists, activity). Sub tabs at #/stocks/{holdings|watchlists|activity}.
import * as BK from '../lab/book.js';
import * as M from '../lab/model.js';
import * as MK from '../lab/market.js';
import { h, money, pct, num, dec, dateStr, section, table, btn, dialog, confirmDialog, formDialog, rowList, empty, segTabs, subTab, posNeg, toast } from '../ui.js';
import { sortFilterBar } from '../mobilebar.js';
import { LAB, st, books, selBooks, tone, signedRs, activeAccounts, rerender, quote, rs2, run } from './lab-shared.js';
import { ticket, deleteTxn, snap } from './lab-trade.js';

const TABS = [['holdings', 'Holdings'], ['watchlists', 'Watchlists'], ['activity', 'Activity']];
let sortKey = 'value', sortDir = 'desc', listId = null, actFilter = { type: 'all', q: '' };

/** Holdings of the chosen accounts, one line per share (an account's lines are added up when several are chosen). */
function holdingRows(sel) {
  const m = new Map();
  for (const b of sel) for (const p of b.v.holdings) {
    const r = m.get(p.symbol) || { symbol: p.symbol, name: p.name, yahoo: p.yahoo, qty: 0, cost: 0, value: 0, dayPnl: 0, price: p.price, prevClose: p.prevClose, noPrice: false, accts: [] };
    r.qty += p.qty; r.cost += p.cost; r.value += p.value; r.dayPnl += p.dayPnl; r.noPrice = r.noPrice || p.noPrice; r.accts.push({ id: b.acct.id, name: b.acct.name, qty: p.qty }); m.set(p.symbol, r);
  }
  return [...m.values()].map((r) => ({ ...r, avg: r.qty ? r.cost / r.qty : 0, pnl: r.value - r.cost, ret: r.cost ? (r.value - r.cost) / r.cost : 0, dayPct: r.prevClose > 0 && r.price > 0 ? (r.price - r.prevClose) / r.prevClose : null }));
}
const SORTS = [{ value: 'value', label: 'Value', kind: 'num' }, { value: 'pnl', label: 'P&L in ₹', kind: 'num' }, { value: 'ret', label: 'Return %', kind: 'num' }, { value: 'day', label: 'Today', kind: 'num' }, { value: 'name', label: 'Name', kind: 'text' }];
const sortVal = (r) => (sortKey === 'name' ? String(r.name || r.symbol).toLowerCase() : sortKey === 'pnl' ? r.pnl : sortKey === 'ret' ? r.ret : sortKey === 'day' ? r.dayPnl : r.value);
const sorted = (rows) => rows.slice().sort((a, b) => { const x = sortVal(a), y = sortVal(b), c = typeof x === 'string' ? x.localeCompare(y) : x - y; return sortDir === 'desc' ? -c : c; });

function rowActions(r) {
  const best = r.accts.slice().sort((a, b) => b.qty - a.qty)[0];
  dialog(r.name || r.symbol, h('div', null,
    rowList([{ title: 'Holding', sub: r.accts.map((a) => `${a.name}: ${num(a.qty)}`).join(' · '), value: `${num(r.qty)} shares`, valueSub: `avg ${rs2(r.avg)}` },
      { title: 'Price now', sub: r.noPrice ? 'No saved price. Refresh prices.' : r.dayPct == null ? '' : `today ${(r.dayPct >= 0 ? '+' : '') + pct(r.dayPct, 2)}`, value: r.noPrice ? '–' : rs2(r.price) },
      { title: 'Value', sub: `invested ${money(r.cost)}`, value: money(r.value) }, { title: 'Profit / loss', value: h('span', { class: tone(r.pnl) }, signedRs(r.pnl)), valueSub: h('span', { class: tone(r.pnl) }, (r.ret > 0 ? '+' : '') + pct(r.ret, 2)) }])),
    [{ label: 'Close', onclick: (c) => c() }, { label: 'Buy more', onclick: (c) => { c(); ticket({ side: 'buy', symbol: r.symbol, name: r.name, yahoo: r.yahoo, acct: best.id }); } }, { label: 'Sell', class: 'primary', onclick: (c) => { c(); ticket({ side: 'sell', symbol: r.symbol, name: r.name, yahoo: r.yahoo, acct: best.id }); } }]);
}

function holdings(root) {
  const sel = selBooks(), rows = holdingRows(sel);
  const tv = rows.reduce((a, r) => a + r.value, 0), tc = rows.reduce((a, r) => a + r.cost, 0), td = rows.reduce((a, r) => a + r.dayPnl, 0);
  const bar = sortFilterBar({ sort: { options: SORTS, value: sortKey, dir: sortDir, apply: (v, d) => { sortKey = v; sortDir = d; rerender(); } } });
  const desk = h('label', { class: 'inline-label desk-ctl' }, 'Sort by ', h('select', { onchange: (e) => { sortKey = e.target.value; sortDir = sortKey === 'name' ? 'asc' : 'desc'; rerender(); } }, SORTS.map((o) => h('option', { value: o.value, selected: o.value === sortKey }, o.label))),
    h('select', { 'aria-label': 'Direction', onchange: (e) => { sortDir = e.target.value; rerender(); } }, [['desc', 'Descending'], ['asc', 'Ascending']].map(([v, l]) => h('option', { value: v, selected: v === sortDir }, l))));
  const dayCell = (r) => (r.dayPct == null ? h('span', { class: 'muted' }, '–') : h('span', { class: posNeg(r.dayPnl) }, (r.dayPct >= 0 ? '+' : '') + pct(r.dayPct, 2)));
  root.append(section('Holdings', h('div', null,
    h('div', { class: 'tbl-tools' }, bar, desk),
    table([
      { label: 'Holding', host: true, render: (r) => h('span', null, r.name || r.symbol, r.name && r.name !== r.symbol ? h('small', { class: 'sub' }, ' ' + r.symbol) : null, r.noPrice ? h('small', { class: 'tag' }, 'no price') : null) },
      { label: 'Qty · Average', cls: 'r', render: (r) => h('div', null, h('div', null, num(r.qty)), h('div', { class: 'sub2' }, 'avg ' + rs2(r.avg))) },
      { label: 'Price · Today', cls: 'r', render: (r) => h('div', null, h('div', null, r.price > 0 ? rs2(r.price) : '–'), h('div', { class: 'sub2' }, dayCell(r))) },
      { label: 'Value · Invested', cls: 'r', render: (r) => h('div', null, h('div', { class: 'b' }, money(r.value)), h('div', { class: 'sub2' }, '(' + money(r.cost) + ')')), total: () => money(tv) },
      { label: 'Gain · Return', cls: 'r', render: (r) => h('div', null, h('div', { class: 'b ' + tone(r.pnl) }, signedRs(r.pnl)), h('div', { class: 'sub2 ' + tone(r.pnl) }, (r.ret > 0 ? '+' : '') + pct(r.ret, 1))), total: () => h('span', { class: tone(tv - tc) }, signedRs(tv - tc)) },
      { label: 'Today’s change', cls: 'r', show: 'desk', render: (r) => h('span', { class: tone(r.dayPnl) }, signedRs(r.dayPnl)), total: () => h('span', { class: tone(td) }, signedRs(td)) },
    ], sorted(rows), { footer: { label: 'Total' }, onRow: rowActions, empty: 'No open positions. Press “Buy / sell” to place an order.',
      m: { key: 'tl-hold', head: 'Holding', views: [['Value · Invested'], ['Gain · Return'], ['Price · Today'], ['Qty · Average']] } }),
    h('p', { class: 'note' }, 'Prices are from your last refresh. A share without a price is shown at what you paid, so a missing price never looks like a loss.')),
    [btn('Buy / sell', () => ticket(), 'primary')]));
}

// ---------- watchlists ----------
function watchForm(list, item) {
  const isNew = !item;
  formDialog({ title: isNew ? 'Add to ' + list.name : 'Edit ' + (item.name || item.symbol), saveLabel: isNew ? 'Add' : 'Save',
    fields: [{ key: 'symbol', label: 'Share symbol', type: 'text', required: true, readonly: !isNew, hint: isNew ? 'NSE symbol such as RELIANCE. For an index or other ticker use its Yahoo code, for example ^NSEI.' : '' },
      { key: 'name', label: 'Name (optional)', type: 'text' },
      { key: 'target', label: 'Target price (₹, optional)', type: 'number', half: true }, { key: 'dir', label: 'Alert when price is', type: 'select', half: true, options: [{ value: 'above', label: 'At or above target' }, { value: 'below', label: 'At or below target' }] },
      { key: 'note', label: 'Note', type: 'textarea' }],
    value: { symbol: item ? item.symbol : '', name: item ? item.name : '', target: item && item.target ? item.target : '', dir: item ? item.dir || 'above' : 'above', note: item ? item.note : '' },
    onDelete: isNew ? null : () => run((l) => { const w = l.watchlists.find((x) => x.id === list.id); w.items = w.items.filter((i) => i.symbol !== item.symbol); }, 'Removed'),
    deleteMessage: 'Remove this share from the watchlist?',
    onSave: (v) => {
      const sym = String(v.symbol || '').trim().toUpperCase();
      if (!/^[A-Z0-9.&^=\-]{1,25}$/.test(sym)) { toast('Enter a valid symbol.', 'bad'); return false; }
      if (isNew && list.items.some((i) => i.symbol === sym)) { toast(sym + ' is already on this list.', 'bad'); return false; }
      if (!run((l) => { const w = l.watchlists.find((x) => x.id === list.id); const rec = { symbol: sym, name: (v.name || '').trim(), target: v.target > 0 ? v.target : null, dir: v.dir, note: (v.note || '').trim() };
        if (isNew) w.items.push(rec); else Object.assign(w.items.find((i) => i.symbol === item.symbol), rec); })) return false;
      if (isNew && !quote(sym)) MK.refresh(LAB(), [{ symbol: sym }]).then(() => rerender()).catch(() => {});
    } });
}
function listForm(list) {
  const isNew = !list;
  formDialog({ title: isNew ? 'New watchlist' : 'Rename watchlist', fields: [{ key: 'name', label: 'Name', type: 'text', required: true }], value: { name: list ? list.name : '' }, saveLabel: isNew ? 'Create' : 'Save',
    onDelete: isNew ? null : () => { if (run((l) => { l.watchlists = l.watchlists.filter((x) => x.id !== list.id); }, 'Watchlist deleted')) listId = null; }, deleteMessage: 'Delete this watchlist and its notes?',
    onSave: (v) => { const nm = v.name.trim(); if (LAB().watchlists.some((w) => w.name.toLowerCase() === nm.toLowerCase() && (!list || w.id !== list.id))) { toast('You already have a list with this name.', 'bad'); return false; }
      let id; if (!run((l) => { if (isNew) { id = M.newId('lw'); l.watchlists.push({ id, name: nm, items: [] }); } else l.watchlists.find((x) => x.id === list.id).name = nm; })) return false; if (id) listId = id; rerender(); } });
}
function watchlists(root) {
  const lab = LAB(), lists = lab.watchlists;
  if (!lists.length) { root.append(h('div', { class: 'card lab-empty' }, h('p', null, 'Create a watchlist to follow shares you are thinking about, with target prices and notes.'), btn('New watchlist', () => listForm(null), 'primary'))); return; }
  if (!listId || !lists.some((l) => l.id === listId)) listId = lists[0].id;
  const list = lists.find((l) => l.id === listId);
  const reached = (i, q) => i.target > 0 && q && q.price > 0 && (i.dir === 'below' ? q.price <= i.target : q.price >= i.target);
  const rows = list.items.map((i) => { const q = quote(i.symbol), p = q && q.price > 0 ? q.price : null; return { ...i, price: p, dayPct: p && q.prevClose > 0 ? (p - q.prevClose) / q.prevClose : null, toTarget: p && i.target > 0 ? (i.target - p) / p : null, hit: reached(i, q) }; });
  root.append(h('div', { class: 'tbl-tools' }, h('nav', { class: 'seg sub', role: 'tablist', 'aria-label': 'Watchlists' }, lists.map((l) => h('a', { href: 'javascript:void 0', role: 'tab', class: l.id === listId ? 'on' : '', 'aria-selected': String(l.id === listId), onclick: (e) => { e.preventDefault(); listId = l.id; rerender(); } }, l.name))),
    h('span', null, btn('New watchlist', () => listForm(null)), ' ', btn('Edit list', () => listForm(list)))));
  root.append(section(list.name, h('div', null, table([
    { label: 'Share', host: true, render: (r) => h('span', null, r.name || r.symbol, r.name ? h('small', { class: 'sub' }, ' ' + r.symbol) : null, r.hit ? h('small', { class: 'tag pos' }, 'target hit') : null) },
    { label: 'Price · Today', cls: 'r', render: (r) => h('div', null, h('div', null, r.price ? rs2(r.price) : '–'), h('div', { class: 'sub2 ' + tone(r.dayPct) }, r.dayPct == null ? '' : (r.dayPct >= 0 ? '+' : '') + pct(r.dayPct, 2))) },
    { label: 'Target · Distance', cls: 'r', render: (r) => (r.target ? h('div', null, h('div', null, (r.dir === 'below' ? '≤ ' : '≥ ') + rs2(r.target)), h('div', { class: 'sub2' }, r.toTarget == null ? '' : (r.toTarget >= 0 ? '+' : '') + pct(r.toTarget, 1) + ' away')) : h('span', { class: 'muted' }, '–')) },
    { label: 'Note', render: (r) => h('span', { class: 'muted' }, r.note || '') },
  ], rows, { onRow: (r) => dialog(r.name || r.symbol, h('div', null, r.note ? h('p', null, r.note) : h('p', { class: 'muted' }, 'No note.')), [{ label: 'Close', onclick: (c) => c() }, { label: 'Edit', onclick: (c) => { c(); watchForm(list, list.items.find((i) => i.symbol === r.symbol)); } }, { label: 'Buy', class: 'primary', onclick: (c) => { c(); ticket({ side: 'buy', symbol: r.symbol, name: r.name, yahoo: r.yahoo }); } }]), empty: 'Nothing on this list yet.',
    m: { key: 'tl-watch', head: 'Share', views: [['Price · Today'], ['Target · Distance']] } }),
    h('p', { class: 'note' }, 'Tap a share to read its note, edit the target, or buy it.')),
    [btn('Add share', () => watchForm(list, null), 'primary')]));
}

// ---------- activity ----------
function activity(root) {
  const lab = LAB(), ids = new Set(selBooks().map((b) => b.acct.id));
  let rows = BK.tradeRows(lab).filter((r) => ids.has(r.acct));
  const q = actFilter.q.trim().toLowerCase();
  if (actFilter.type !== 'all') rows = rows.filter((r) => (actFilter.type === 'trades' ? r.strategy !== 'Cash' : actFilter.type === 'cash' ? r.strategy === 'Cash' : r.type === actFilter.type));
  if (q) rows = rows.filter((r) => `${r.symbol} ${r.name} ${r.note}`.toLowerCase().includes(q));
  root.append(section(`Activity (${rows.length})`, h('div', null,
    h('div', { class: 'tbl-tools' }, h('label', { class: 'inline-label' }, 'Show ', h('select', { onchange: (e) => { actFilter.type = e.target.value; rerender(); } }, [['all', 'Everything'], ['trades', 'Trades only'], ['buy', 'Buys'], ['sell', 'Sells'], ['cash', 'Cash movements']].map(([v, l]) => h('option', { value: v, selected: v === actFilter.type }, l)))),
      h('input', { type: 'search', placeholder: 'Find a share or note', value: actFilter.q, 'aria-label': 'Search activity', oninput: (e) => { actFilter.q = e.target.value; clearTimeout(window.__tlq); window.__tlq = setTimeout(() => { rerender(); const i = document.querySelector('input[aria-label="Search activity"]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 250); } })),
    table([
      { label: 'Date', mob: 'under', get: (r) => dateStr(r.date) }, { label: 'Order', host: true, render: (r) => h('span', null, r.typeLabel + (r.name || r.symbol ? ' · ' + (r.name || r.symbol) : '')) },
      { label: 'Account', mob: 'under', get: (r) => r.account }, { label: 'Quantity', cls: 'r', get: (r) => (r.qty === '' ? '' : num(r.qty)) }, { label: 'Price', cls: 'r', get: (r) => (r.price === '' ? '' : rs2(Number(r.price))) },
      { label: 'Amount', cls: 'r', get: (r) => money(r.amount) }, { label: 'Charges', cls: 'r', show: 'desk', get: (r) => (r.fees ? rs2(r.fees) : '') },
      { label: 'Realised P&L', cls: 'r', render: (r) => (r.realized === '' ? '' : h('span', { class: tone(r.realized) }, signedRs(r.realized))) },
    ], rows.slice(0, 200), { onRow: (r) => deleteTxn(lab.txns.find((t) => t.id === r.id)), empty: 'No activity yet.',
      m: { key: 'tl-act', head: 'Order', sub: ['Date', 'Account'], views: [['Amount', 'Realised P&L'], ['Price', 'Quantity']] } }),
    rows.length > 200 ? h('p', { class: 'note' }, 'Showing the latest 200. Use Reports to see and export everything.') : h('p', { class: 'note' }, 'Tap a line to delete it. The account is recalculated, and a delete that would leave it short of cash or shares is refused.'))));
}

export function render(embedded) {
  const root = h('div', { class: 'page' }), tab = subTab(TABS.map((t) => t[0]));
  root.append(segTabs(TABS, tab, 'Stocks views'));
  if (!activeAccounts(LAB()).length) { root.append(empty('Create a trading account first (Accounts).')); return root; }
  (tab === 'watchlists' ? watchlists : tab === 'activity' ? activity : holdings)(root);
  return root;
}
