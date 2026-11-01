// Trading Lab: Stocks (holdings, watchlists, activity). Sub tabs at #/stocks/{holdings|watchlists|activity}.
// Holdings open with summary cards (including XIRR), top performers and allocation; every share opens its own page (#/stock/SYMBOL).
import * as BK from '../lab/book.js';
import * as M from '../lab/model.js';
import * as MK from '../lab/market.js';
import * as P from '../lab/perf.js';
import * as HS from '../lab/history.js';
import { h, money, pct, num, dec, dateStr, section, table, btn, dialog, confirmDialog, formDialog, rowList, empty, segTabs, subTab, toast, stat } from '../ui.js';
import { sortFilterBar } from '../mobilebar.js';
import { donut, legend } from '../charts.js';
import { LAB, st, books, selBooks, tone, signedRs, activeAccounts, rerender, quote, rs2, run, today, ago, chg, plRs, plBoth, plPct, rangeBar, stockHref, openStock, crore } from './lab-shared.js';
import { ticket, deleteTxn } from './lab-trade.js';

const TABS = [['holdings', 'Holdings'], ['watchlists', 'Watchlists'], ['activity', 'Activity']];
let sortKey = 'value', sortDir = 'desc', listId = null, actFilter = { type: 'all', q: '' }, rankBy = 'ret', allocBy = 'share';
const toneR = (r) => (r > 0.00005 ? 'pos' : r < -0.00005 ? 'neg' : '');

/** Holdings of the chosen accounts, one line per share (an account's lines are added up when several are chosen). */
function holdingRows(sel, txns) {
  const m = new Map();
  for (const b of sel) for (const p of b.v.holdings) {
    const r = m.get(p.symbol) || { symbol: p.symbol, name: p.name, yahoo: p.yahoo, qty: 0, cost: 0, value: 0, dayPnl: 0, price: p.price, prevClose: p.prevClose, noPrice: false, accts: [] };
    r.qty += p.qty; r.cost += p.cost; r.value += p.value; r.dayPnl += p.dayPnl; r.noPrice = r.noPrice || p.noPrice; r.accts.push({ id: b.acct.id, name: b.acct.name, qty: p.qty }); m.set(p.symbol, r);
  }
  const tv = [...m.values()].reduce((a, r) => a + r.value, 0), now = today();
  return [...m.values()].map((r) => ({ ...r, avg: r.qty ? r.cost / r.qty : 0, pnl: r.value - r.cost, ret: r.cost ? (r.value - r.cost) / r.cost : 0, weight: tv ? r.value / tv : 0,
    dayPct: r.prevClose > 0 && r.price > 0 ? (r.price - r.prevClose) / r.prevClose : null, xirr: P.symbolXirr(txns, r.symbol, r.value, now), q: quote(r.symbol) }));
}
const SORTS = [{ value: 'value', label: 'Value', kind: 'num' }, { value: 'pnl', label: 'P&L in ₹', kind: 'num' }, { value: 'ret', label: 'Return %', kind: 'num' }, { value: 'day', label: 'Today', kind: 'num' }, { value: 'xirr', label: 'XIRR', kind: 'num' }, { value: 'weight', label: 'Weight', kind: 'num' }, { value: 'name', label: 'Name', kind: 'text' }];
const sortVal = (r) => (sortKey === 'name' ? String(r.name || r.symbol).toLowerCase() : sortKey === 'pnl' ? r.pnl : sortKey === 'ret' ? r.ret : sortKey === 'day' ? r.dayPnl : sortKey === 'xirr' ? (r.xirr == null ? -Infinity : r.xirr) : sortKey === 'weight' ? r.weight : r.value);
const sorted = (rows) => rows.slice().sort((a, b) => { const x = sortVal(a), y = sortVal(b), c = typeof x === 'string' ? x.localeCompare(y) : x - y; return sortDir === 'desc' ? -c : c; });

const miniList = (title, rows, metric, hint) => h('div', { class: 'mvbox' }, h('h3', { class: 'mini-title' }, title),
  rows.length ? rowList(rows.map((r) => ({ title: r.name && r.name !== r.symbol ? r.symbol : r.symbol, sub: r.name && r.name !== r.symbol ? r.name : `${num(r.qty)} shares`, value: metric(r), valueSub: hint(r), onClick: () => openStock(r.symbol) }))) : h('p', { class: 'muted mv-none' }, 'None right now'));

function holdings(root) {
  const lab = LAB(), sel = selBooks(), ids = new Set(sel.map((b) => b.acct.id)), txns = lab.txns.filter((t) => ids.has(t.acct)), rows = holdingRows(sel, txns), now = today();
  const tv = rows.reduce((a, r) => a + r.value, 0), tc = rows.reduce((a, r) => a + r.cost, 0), td = rows.reduce((a, r) => a + r.dayPnl, 0);
  const realisedStock = sel.reduce((a, b) => a + b.rp.realizedStock, 0);
  const stockX = P.groupXirr(txns, (t) => t.type === 'buy' || t.type === 'sell', tv, now), portX = P.portfolioXirr(txns, sel.reduce((a, b) => a + b.v.value, 0), now), days = P.historyDays(txns, now);
  const dayBase = rows.reduce((a, r) => a + (r.prevClose > 0 ? r.qty * r.prevClose : 0), 0);
  root.append(h('div', { class: 'stats lab-stats' },
    stat('Invested', money(tc), `${rows.length} share${rows.length === 1 ? '' : 's'}`),
    stat('Current value', money(tv), rows.some((r) => r.noPrice) ? `${rows.filter((r) => r.noPrice).length} without a price` : 'at last refresh'),
    stat('Total return', plBoth(tv - tc, tc ? (tv - tc) / tc : 0, 2), `booked ${signedRs(realisedStock)}`),
    stat('Today', plBoth(td, dayBase ? td / dayBase : 0, 2), 'since yesterday’s close'),
    stat('XIRR', stockX == null ? '–' : plPct(stockX, 1), stockX == null ? 'needs 30+ days of history' : (portX == null ? 'annualised' : `whole account ${pct(portX, 1)}`) + (days < 90 ? ' · short history' : '')),
    stat('Best / worst', (() => { const pr = rows.filter((r) => !r.noPrice).sort((a, b) => b.ret - a.ret); return pr.length > 1 && pr[0].ret !== pr[pr.length - 1].ret ? h('span', null, h('span', { class: 'pos' }, pr[0].symbol), ' / ', h('span', { class: 'neg' }, pr[pr.length - 1].symbol)) : '–'; })(), 'by return on cost')));
  if (!rows.length) { root.append(section('Holdings', h('div', null, empty('No open positions yet.'), h('p', { class: 'note' }, 'Search for a share above, or press Buy / sell.')), [btn('Buy / sell', () => ticket(), 'primary')])); return; }

  // top performers
  const by = rankBy === 'pnl' ? (r) => r.pnl : (r) => r.ret, top = rows.slice().sort((a, b) => by(b) - by(a)), best = top.filter((r) => by(r) > 0.00005).slice(0, 3), worst = top.slice().reverse().filter((r) => by(r) < -0.00005).slice(0, 3);
  const movers = rows.filter((r) => r.dayPct != null).sort((a, b) => b.dayPct - a.dayPct), big = rows.slice().sort((a, b) => b.weight - a.weight).slice(0, 3);
  const metric = (r) => (rankBy === 'pnl' ? plRs(r.pnl) : plPct(r.ret, 1)), hint = (r) => (rankBy === 'pnl' ? plPct(r.ret, 1) : plRs(r.pnl));
  const chip = (l, on, fn) => h('button', { type: 'button', class: 'chipopt' + (on ? ' on' : ''), 'aria-pressed': String(on), onclick: fn }, l);
  root.append(section('Top performers', h('div', null, h('div', { class: 'movers' },
    miniList('Top gainers', best, metric, hint), miniList('Top losers', worst, metric, hint),
    miniList('Today’s movers', [...movers.filter((r) => r.dayPct > 0).slice(0, 2), ...movers.filter((r) => r.dayPct < 0).reverse().slice(0, 1)], (r) => chg(r.dayPct, 2), (r) => plRs(r.dayPnl)),
    miniList('Biggest positions', big, (r) => pct(r.weight, 1), (r) => money(r.value))),
    h('p', { class: 'note' }, 'Ranked on the prices from your last refresh. A share with no price is left out of the rankings.')),
  [h('div', { class: 'chipset-inline' }, chip('By return', rankBy === 'ret', () => { rankBy = 'ret'; rerender(); }), chip('By profit ₹', rankBy === 'pnl', () => { rankBy = 'pnl'; rerender(); }))]));

  // allocation
  const sectorOf = (r) => ((HS.dataOf(r.symbol) || {}).fund || {}).sector || 'Not loaded';
  const haveSector = rows.some((r) => sectorOf(r) !== 'Not loaded');
  if (allocBy === 'sector' && !haveSector) allocBy = 'share';
  const groups = new Map(); for (const r of rows) { const k = allocBy === 'sector' ? sectorOf(r) : r.symbol; groups.set(k, (groups.get(k) || 0) + r.value); }
  let items = [...groups.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  if (items.length > 8) items = [...items.slice(0, 7), { label: 'Others', value: items.slice(7).reduce((a, x) => a + x.value, 0) }];
  root.append(section('Allocation', h('div', { class: 'alloc-main' }, donut(items, { fmt: money, center: money(tv), sub: allocBy === 'sector' ? 'by sector' : 'by share', onSelect: allocBy === 'share' && items.length ? (it) => { if (it.label !== 'Others') openStock(it.label); } : null }), legend(items, { fmt: money })),
    haveSector ? [h('div', { class: 'chipset-inline' }, chip('By share', allocBy === 'share', () => { allocBy = 'share'; rerender(); }), chip('By sector', allocBy === 'sector', () => { allocBy = 'sector'; rerender(); }))] : null));

  const bar = sortFilterBar({ sort: { options: SORTS, value: sortKey, dir: sortDir, apply: (v, d) => { sortKey = v; sortDir = d; rerender(); } } });
  const desk = h('label', { class: 'inline-label desk-ctl' }, 'Sort by ', h('select', { onchange: (e) => { sortKey = e.target.value; sortDir = sortKey === 'name' ? 'asc' : 'desc'; rerender(); } }, SORTS.map((o) => h('option', { value: o.value, selected: o.value === sortKey }, o.label))),
    h('select', { 'aria-label': 'Direction', onchange: (e) => { sortDir = e.target.value; rerender(); } }, [['desc', 'Descending'], ['asc', 'Ascending']].map(([v, l]) => h('option', { value: v, selected: v === sortDir }, l))));
  const act = (r, side) => (e) => { e.stopPropagation(); const best = r.accts.slice().sort((a, b) => b.qty - a.qty)[0]; ticket({ side, symbol: r.symbol, name: r.name, yahoo: r.yahoo, acct: best.id }); };
  root.append(section('Holdings', h('div', null, h('div', { class: 'tbl-tools' }, bar, desk),
    table([
      { label: 'Holding', host: true, render: (r) => h('span', { class: 'hold-name' }, h('a', { class: 'sym', href: stockHref(r.symbol), onclick: (e) => e.stopPropagation() }, r.name && r.name !== r.symbol ? r.name : r.symbol), r.name && r.name !== r.symbol ? h('small', { class: 'sub' }, ' ' + r.symbol) : null, r.noPrice ? h('small', { class: 'tag' }, 'no price') : null) },
      { label: 'Qty · Avg', cls: 'r', render: (r) => h('div', null, h('div', null, num(r.qty)), h('div', { class: 'sub2' }, 'avg ' + rs2(r.avg))) },
      { label: 'LTP · Today', cls: 'r', render: (r) => h('div', null, h('div', null, r.price > 0 ? rs2(r.price) : '–'), h('div', { class: 'sub2' }, r.dayPct == null ? h('span', { class: 'muted' }, '–') : chg(r.dayPct, 2))) },
      { label: 'Value · Invested', cls: 'r', render: (r) => h('div', null, h('div', { class: 'b' }, money(r.value)), h('div', { class: 'sub2' }, '(' + money(r.cost) + ')')), total: () => money(tv) },
      { label: 'P&L · Return', cls: 'r', render: (r) => h('div', null, h('div', { class: 'b ' + tone(r.pnl) }, signedRs(r.pnl)), h('div', { class: 'sub2' }, plPct(r.ret, 1))), total: () => h('div', null, h('div', { class: 'b ' + tone(tv - tc) }, signedRs(tv - tc)), h('div', { class: 'sub2' }, plPct(tc ? (tv - tc) / tc : 0, 1))) },
      { label: 'XIRR', cls: 'r', show: 'desk', render: (r) => (r.xirr == null ? h('span', { class: 'muted' }, '–') : plPct(r.xirr, 1)), total: () => (stockX == null ? '' : plPct(stockX, 1)) },
      { label: 'Weight', cls: 'r', show: 'desk', render: (r) => h('span', { class: 'wt' }, pct(r.weight, 1), h('i', { style: { width: Math.max(2, r.weight * 100) + '%' } })), total: () => '100%' },
      { label: 'Today’s change', cls: 'r', show: 'desk', render: (r) => plRs(r.dayPnl), total: () => plRs(td) },
      { label: 'Trade', cls: 'r', show: 'desk', render: (r) => h('span', { class: 'row-actions' }, h('button', { type: 'button', class: 'small tp-mini buy', onclick: act(r, 'buy') }, 'Buy'), h('button', { type: 'button', class: 'small tp-mini sell', onclick: act(r, 'sell') }, 'Sell')) },
    ], sorted(rows), { footer: { label: 'Total' }, onRow: (r) => openStock(r.symbol), empty: 'No open positions. Press “Buy / sell” to place an order.',
      m: { key: 'tl-hold2', head: 'Holding', views: [['Value · Invested'], ['P&L · Return'], ['LTP · Today'], ['Qty · Avg'], ['XIRR', 'Weight']] } }),
    h('p', { class: 'note' }, 'Tap a share for its chart, figures and trade panel. Prices are from your last refresh; a share without a price is shown at what you paid, so a missing price never looks like a loss. XIRR is the annualised return counting when each rupee went in.')),
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
      if (isNew) toast(`${sym} added. Press “Get prices” to fetch its price.`);
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
  if (!lists.length) { root.append(h('div', { class: 'card lab-empty' }, h('p', null, 'Create a watchlist to follow shares you are thinking about, with target prices and notes. You can also press ☆ Watch on any share’s page.'), btn('New watchlist', () => listForm(null), 'primary'))); return; }
  if (!listId || !lists.some((l) => l.id === listId)) listId = lists[0].id;
  const list = lists.find((l) => l.id === listId);
  const reached = (i, q) => i.target > 0 && q && q.price > 0 && (i.dir === 'below' ? q.price <= i.target : q.price >= i.target);
  const rows = list.items.map((i) => { const q = quote(i.symbol), p = q && q.price > 0 ? q.price : null, fd = (HS.dataOf(i.symbol) || {}).fund || {}; return { ...i, q, price: p, dayPct: p && q.prevClose > 0 ? (p - q.prevClose) / q.prevClose : null, toTarget: p && i.target > 0 ? (i.target - p) / p : null, hit: reached(i, q), pe: fd.pe, cap: fd.marketCap, fromHigh: p && q.high52 ? p / q.high52 - 1 : null }; });
  const getPrices = async (b) => {
    if (!list.items.length) return toast('Add a share first.', 'bad');
    b.disabled = true; const was = b.textContent; b.textContent = 'Getting…';
    try { const r = await MK.refresh(LAB(), list.items.map((i) => ({ symbol: i.symbol, yahoo: i.yahoo })), { only: true }); toast(r.errors.length ? `Updated ${r.got} of ${r.total}. ${r.errors[0]}` : `Updated ${r.got} price${r.got === 1 ? '' : 's'}`, r.errors.length ? 'bad' : ''); } catch (e) { toast(e.message, 'bad'); }
    b.disabled = false; b.textContent = was; rerender();
  };
  root.append(h('div', { class: 'tbl-tools' }, h('nav', { class: 'seg sub', role: 'tablist', 'aria-label': 'Watchlists' }, lists.map((l) => h('a', { href: 'javascript:void 0', role: 'tab', class: l.id === listId ? 'on' : '', 'aria-selected': String(l.id === listId), onclick: (e) => { e.preventDefault(); listId = l.id; rerender(); } }, l.name))),
    h('span', null, btn('New watchlist', () => listForm(null)), ' ', btn('Edit list', () => listForm(list)))));
  root.append(section(list.name, h('div', null, table([
    { label: 'Share', host: true, render: (r) => h('span', null, h('a', { class: 'sym', href: stockHref(r.symbol), onclick: (e) => e.stopPropagation() }, r.name || r.symbol), r.name ? h('small', { class: 'sub' }, ' ' + r.symbol) : null, r.hit ? h('small', { class: 'tag pos' }, 'target hit') : null, !r.price ? h('small', { class: 'tag' }, 'no price') : null) },
    { label: 'Price · Today', cls: 'r', render: (r) => h('div', null, h('div', { class: 'b' }, r.price ? rs2(r.price) : '–'), h('div', { class: 'sub2' }, r.dayPct == null ? h('span', { class: 'muted' }, r.price ? '' : 'Get prices') : chg(r.dayPct, 2))) },
    { label: 'Day range', cls: 'r', show: 'desk', render: (r) => (r.q && r.q.dayLow ? `${dec(r.q.dayLow, 2)} – ${dec(r.q.dayHigh, 2)}` : h('span', { class: 'muted' }, '–')) },
    { label: '52-week', cls: 'r', render: (r) => (r.q && r.q.low52 ? h('div', null, h('div', { class: 'sub2' }, `${dec(r.q.low52, 0)} – ${dec(r.q.high52, 0)}`), rangeBar(r.q.low52, r.q.high52, r.price), r.fromHigh != null ? h('div', { class: 'sub2' }, chg(r.fromHigh, 1), ' from high') : null) : h('span', { class: 'muted' }, '–')) },
    { label: 'P/E · Cap', cls: 'r', show: 'desk', render: (r) => (r.pe || r.cap ? h('div', null, h('div', null, r.pe ? dec(r.pe, 1) : '–'), h('div', { class: 'sub2' }, r.cap ? crore(r.cap) : '')) : h('span', { class: 'muted' }, '–')) },
    { label: 'Target · Distance', cls: 'r', render: (r) => (r.target ? h('div', null, h('div', null, (r.dir === 'below' ? '≤ ' : '≥ ') + rs2(r.target)), h('div', { class: 'sub2' }, r.toTarget == null ? '' : (r.toTarget >= 0 ? '+' : '') + pct(r.toTarget, 1) + ' away')) : h('span', { class: 'muted' }, '–')) },
    { label: 'Note', show: 'desk', render: (r) => h('span', { class: 'muted' }, r.note || '') },
    { label: 'Trade', cls: 'r', show: 'desk', render: (r) => h('span', { class: 'row-actions' }, h('button', { type: 'button', class: 'small', onclick: (e) => { e.stopPropagation(); watchForm(list, list.items.find((i) => i.symbol === r.symbol)); } }, 'Edit'), h('button', { type: 'button', class: 'small tp-mini buy', onclick: (e) => { e.stopPropagation(); ticket({ side: 'buy', symbol: r.symbol, name: r.name, yahoo: r.yahoo }); } }, 'Buy')) },
  ], rows, { onRow: (r) => openStock(r.symbol), empty: 'Nothing on this list yet.',
    m: { key: 'tl-watch2', head: 'Share', views: [['Price · Today'], ['52-week'], ['Target · Distance']] } }),
    h('p', { class: 'note' }, 'Tap a share for its page. Prices are fetched only when you press Get prices; adding a share does not fetch anything. Day range and 52-week range appear after a price fetch; P/E and market cap after you load that share’s chart and fundamentals.')),
    [btn('Add share', () => watchForm(list, null), 'primary'), h('button', { type: 'button', class: 'small', onclick: (e) => getPrices(e.currentTarget) }, 'Get prices')]));
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
