// Trading Lab: one share on one page (#/stock/SYMBOL). Price, chart, key figures, fundamentals, your position and trades, and the trade panel,
// so a buy or a sell needs no other screen. Chart data and company figures load only when "Load chart & fundamentals" is pressed.
import * as M from '../lab/model.js';
import * as MK from '../lab/market.js';
import * as HS from '../lab/history.js';
import * as P from '../lab/perf.js';
import { S } from '../store.js';
import { h, money, pct, num, dec, dateStr, section, table, btn, dialog, rowList, empty, route, toast, canEdit } from '../ui.js';
import * as LN from '../lab/lines.js';
import * as TK from './chartkit.js';
import { LAB, books, activeAccounts, rerender, quote, rs2, run, today, ago, chg, plRs, plBoth, plPct, rangeBar, crore } from './lab-shared.js';
import { tradePanel, deleteTxn } from './lab-trade.js';

const view = {};
let loading = false;
const symOf = () => decodeURIComponent(route().sub || '').toUpperCase();
const sameSym = (t, s) => String(t.symbol).toUpperCase() === s;

/** Add the share to a watchlist, or take it off. With several lists the person chooses. */
function toggleWatch(sym, name) {
  const lab = LAB(), lists = lab.watchlists || [], has = (l) => l.items.some((i) => i.symbol === sym);
  const flip = (id) => run((l) => { const w = l.watchlists.find((x) => x.id === id); if (has(w)) w.items = w.items.filter((i) => i.symbol !== sym); else w.items.push({ symbol: sym, name: name && name !== sym ? name : '', target: null, dir: 'above', note: '' }); }, 'Watchlist updated');
  if (!lists.length) { if (run((l) => { l.watchlists.push({ id: M.newId('lw'), name: 'My watchlist', items: [{ symbol: sym, name: name && name !== sym ? name : '', target: null, dir: 'above', note: '' }] }); }, 'Added to a new watchlist')) rerender(); return; }
  if (lists.length === 1) { if (flip(lists[0].id)) rerender(); return; }
  const d = dialog('Watchlists', rowList(lists.map((l) => ({ title: l.name, sub: `${l.items.length} share${l.items.length === 1 ? '' : 's'}`, value: has(l) ? '✓ Watching' : 'Add', tone: has(l) ? 'pos' : '', onClick: () => { if (flip(l.id)) { d.close(); rerender(); } } }))), [{ label: 'Done', onclick: (c) => c() }]);
}

async function loadData(b, sym, yahoo, range) {
  if (loading) return;
  if (!S.remote) return toast('Price history needs the Google Drive backend. Connect it in Settings.', 'bad');
  loading = true; b.disabled = true; b.textContent = 'Loading…';
  try {
    const rec = await HS.load(sym, { yahoo, range });
    MK.putQuote(sym, rec.quote);
    if (rec.notes && rec.notes.length) toast('Chart loaded. ' + rec.notes[0]);
    else toast(rec.fund ? 'Chart and company figures loaded' : 'Chart loaded');
  } catch (e) { toast(e.message, 'bad'); }
  loading = false; rerender();
}

const kv = (label, value, sub) => h('div', { class: 'kv' }, h('span', { class: 'kv-l' }, label), h('b', { class: 'kv-v' }, value == null || value === '' ? '–' : value), sub ? h('small', { class: 'kv-s' }, sub) : null);
const x = (v, d = 2) => (v == null ? null : dec(v, d));
const p1 = (v) => (v == null ? null : pct(v, 1));

/** The trading-style chart (toolbar, zoom, trendlines, full view). Lines are saved with the data as lab.lines; everything else is kept on this device. */
function chartCard(sym, rec, trades, avgCost, lab, yahoo) {
  const buys = trades.filter((t) => t.side === 'buy').map((t) => t.date).sort(), once = (fn) => { let id = null; run((l) => { id = fn(l); }); return id; };
  const store = { add: (ln) => once((l) => LN.addLine(l, sym, ln)), update: (id, patch) => run((l) => LN.updateLine(l, id, patch)), remove: (id) => run((l) => LN.removeLine(l, id), 'Line deleted'), clear: () => run((l) => LN.clearLines(l, sym), 'Lines removed') };
  const more = !rec.range || rec.range === '5y' ? h('button', { type: 'button', class: 'small', onclick: (e) => loadData(e.currentTarget, sym, yahoo, '10y') }, 'Load 10 years') : null;
  return h('div', null, TK.chartCard({ key: sym, kind: 'share', hist: rec.hist, today: today(), canEdit: canEdit(), trades, avgCost, firstBuy: buys[0] || null, lines: LN.linesFor(lab, sym), store, priceLabel: 'Close',
    note: `Daily prices up to ${dateStr(rec.hist.d[rec.hist.d.length - 1])}, loaded ${ago(rec.ts)}. Chart data does not update by itself: press “Reload chart” to bring it up to date.` }), more ? h('p', { class: 'note' }, more, ' Longer history lets you see more years and a longer “My buy” range. It is fetched only when you press the button.') : null);
}

function statsCard(sym, q, rec) {
  const f = (rec && rec.fund) || {}, hist = rec && rec.hist, last = hist ? hist.v[hist.v.length - 1] : null, up = f.targetMean && q ? f.targetMean / q.price - 1 : null;
  const t = [
    kv('Day range', q && q.dayLow ? `${dec(q.dayLow, 2)} – ${dec(q.dayHigh, 2)}` : null), kv('Previous close', q && q.prevClose ? dec(q.prevClose, 2) : null),
    kv('52-week range', q && q.low52 ? `${dec(q.low52, 2)} – ${dec(q.high52, 2)}` : null, q && q.low52 ? rangeBar(q.low52, q.high52, q.price) : null),
    kv('From 52-week high', q && q.high52 ? chg(q.price / q.high52 - 1, 1) : null), kv('Volume', q && q.volume ? num(q.volume) : last != null ? num(last * 1000) : null, f.avgVolume ? 'avg ' + num(f.avgVolume) : null),
  ];
  const fund = [
    kv('Market cap', f.marketCap ? crore(f.marketCap) : null), kv('P/E (trailing)', x(f.pe, 1), f.forwardPe ? 'forward ' + dec(f.forwardPe, 1) : null), kv('P/B', x(f.pb, 2)), kv('EPS', x(f.eps, 2)), kv('Book value', x(f.bookValue, 2)),
    kv('Dividend yield', f.dividendYield != null ? pct(f.dividendYield, 2) : null), kv('Beta', x(f.beta, 2)), kv('Return on equity', p1(f.roe)), kv('Return on assets', p1(f.roa)),
    kv('Profit margin', p1(f.profitMargin)), kv('Operating margin', p1(f.operatingMargin)), kv('Revenue growth', p1(f.revenueGrowth)), kv('Earnings growth', p1(f.earningsGrowth)),
    kv('Debt / equity', f.debtToEquity != null ? dec(f.debtToEquity, 1) + '%' : null), kv('Current ratio', x(f.currentRatio, 2)), kv('Revenue', f.revenue ? crore(f.revenue) : null), kv('Free cash flow', f.freeCashflow ? crore(f.freeCashflow) : null),
    kv('Analyst target', f.targetMean ? rs2(f.targetMean) : null, up != null ? h('span', null, chg(up, 1), f.recommendation ? ' · ' + f.recommendation + (f.analysts ? ` (${f.analysts})` : '') : '') : f.recommendation || null),
  ];
  const haveFund = Object.values(f).some((v) => v != null && v !== '' && typeof v !== 'object');
  return section('Key figures', h('div', null, h('div', { class: 'kvs' }, t),
    haveFund ? h('div', null, h('h3', { class: 'mini-title' }, 'Fundamentals'), h('div', { class: 'kvs' }, fund),
      f.sector || f.industry ? h('p', { class: 'sp-about' }, h('b', null, [f.sector, f.industry].filter(Boolean).join(' · ')), f.employees ? ` · ${num(f.employees)} employees` : '') : null, f.about ? h('p', { class: 'note' }, f.about + (f.about.length >= 600 ? '…' : '')) : null,
      h('p', { class: 'note' }, `Company figures come from Yahoo Finance and can be delayed, rounded or missing. Loaded ${rec.fundTs ? ago(rec.fundTs) : ''}.`))
      : h('p', { class: 'note' }, rec ? (rec.notes && rec.notes[0] ? 'Company figures were not available: ' + rec.notes[0] : 'No company figures for this one (indexes and some shares have none).') : 'Press “Load chart & fundamentals” to add company figures such as P/E, market cap, margins and the analyst target.')));
}

function positionCard(sym, q, lab) {
  const bs = books(), rows = [];
  for (const b of bs) { const p = b.v.holdings.find((x) => x.symbol === sym); if (p) rows.push({ acct: b.acct.name, ...p }); }
  if (!rows.length) return section('Your position', h('p', { class: 'muted' }, 'You do not hold this share. Use the panel to buy it.'));
  const qty = rows.reduce((a, r) => a + r.qty, 0), cost = rows.reduce((a, r) => a + r.cost, 0), value = rows.reduce((a, r) => a + r.value, 0), day = rows.reduce((a, r) => a + r.dayPnl, 0);
  const total = bs.reduce((a, b) => a + b.v.value, 0), xi = P.symbolXirr(lab.txns, sym, value, today()), days = P.historyDays(lab.txns.filter((t) => sameSym(t, sym)), today());
  const realised = lab.txns.length ? P.closedTrades(lab.accounts.map((a) => lab.txns.filter((t) => t.acct === a.id))).filter((c) => c.symbol === sym && c.kind !== 'Options').reduce((a, c) => a + c.gain, 0) : 0;
  return section('Your position', h('div', null,
    h('div', { class: 'kvs two' }, kv('Quantity', num(qty)), kv('Average price', rs2(cost / qty)), kv('Invested', money(cost)), kv('Current value', money(value)),
      kv('Profit / loss', plBoth(value - cost, cost ? (value - cost) / cost : 0, 2)), kv('Today', plRs(day)), kv('XIRR', xi == null ? '–' : plPct(xi, 1), xi == null ? 'needs 30+ days of history' : days < 90 ? 'under 90 days: can overstate' : 'a year'), kv('Share of account', total ? pct(value / total, 1) : '–'),
      Math.abs(realised) > 0.005 ? kv('Booked on this share', plRs(realised)) : null),
    rows.length > 1 ? rowList(rows.map((r) => ({ title: r.acct, sub: `${num(r.qty)} @ ${rs2(r.avg)}`, value: money(r.value), valueSub: plRs(r.pnl) }))) : null));
}

function tradesCard(sym, lab) {
  const names = new Map(lab.accounts.map((a) => [a.id, a.name]));
  const rows = lab.accounts.flatMap((a) => M.replay(lab.txns.filter((t) => t.acct === a.id)).rows.filter((t) => (t.type === 'buy' || t.type === 'sell') && sameSym(t, sym)).map((t) => ({ ...t, account: names.get(a.id) }))).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (a.ts || '') < (b.ts || '') ? 1 : -1));
  if (!rows.length) return null;
  return section(`Your trades in ${sym} (${rows.length})`, h('div', null, table([
    { label: 'Date', mob: 'under', get: (r) => dateStr(r.date) }, { label: 'Order', host: true, render: (r) => h('span', { class: r.type === 'buy' ? 'pos' : 'neg' }, (r.type === 'buy' ? 'Buy ' : 'Sell ') + num(r.qty) + ' @ ' + rs2(r.price)) },
    { label: 'Account', mob: 'under', show: 'desk', get: (r) => r.account }, { label: 'Amount', cls: 'r', get: (r) => money(r.amount) },
    { label: 'Realised P&L', cls: 'r', render: (r) => (r.realized == null ? '' : plRs(r.realized)) }, { label: 'Why', show: 'desk', render: (r) => h('span', { class: 'muted' }, r.note || '') },
  ], rows, { onRow: (r) => deleteTxn(lab.txns.find((t) => t.id === r.id)), m: { key: 'tl-sp-tr', head: 'Order', sub: ['Date'], views: [['Amount', 'Realised P&L']] } }),
  h('p', { class: 'note' }, 'Tap a line to delete it. The account is recalculated, and a delete that would leave it short of cash or shares is refused.')));
}

export function render() {
  const sym = symOf(), lab = LAB(), root = h('div', { class: 'page stock-page' });
  if (!sym) { root.append(empty('Choose a share from Stocks, or search for one above.')); return root; }
  if (!activeAccounts(lab).length) { root.append(empty('Create a trading account first (Accounts).')); return root; }
  const q = quote(sym), rec = HS.dataOf(sym), yahoo = MK.yahooFor(sym, '') || (rec && rec.yahoo) || '';
  const known = new Map(); for (const t of lab.txns) if (t.symbol && !M.isOpt(t.type)) known.set(String(t.symbol).toUpperCase(), t.name); for (const w of lab.watchlists || []) for (const i of w.items || []) if (i.name) known.set(i.symbol, i.name);
  const name = known.get(sym) || (rec && rec.fund && rec.fund.name) || (q && q.name) || sym;
  const watching = (lab.watchlists || []).some((w) => w.items.some((i) => i.symbol === sym));
  const dayCh = q && q.prevClose > 0 ? q.price / q.prevClose - 1 : null;

  const panel = tradePanel({ symbol: sym, name, yahoo, restore: true, side: view.side });
  const loadBtn = h('button', { type: 'button', class: 'small', onclick: (e) => loadData(e.currentTarget, sym, yahoo) }, rec ? 'Reload chart' : 'Load chart & fundamentals');
  root.append(h('header', { class: 'card sp-head' },
    h('div', { class: 'sp-title' }, h('a', { class: 'sp-back', href: '#/stocks', 'aria-label': 'Back to stocks' }, '‹'), h('div', null, h('h2', null, name), h('p', { class: 'muted' }, sym + (q && q.name && q.name !== name ? ' · ' + q.name : '') + (rec && rec.ticker ? ' · ' + rec.ticker : '')))),
    h('div', { class: 'sp-price' }, h('b', null, q ? rs2(q.price) : '–'), dayCh != null ? h('span', { class: 'sp-day' }, chg(dayCh), q.prevClose ? h('small', { class: 'muted' }, ` ${(q.price - q.prevClose >= 0 ? '+' : '') + dec(q.price - q.prevClose, 2)} today`) : null) : null, q && q.ts ? h('small', { class: 'muted' }, 'price ' + ago(q.ts)) : h('small', { class: 'muted' }, 'no saved price yet')),
    h('div', { class: 'sp-actions' }, h('button', { type: 'button', class: 'small' + (watching ? ' on' : ''), 'aria-pressed': String(watching), onclick: () => toggleWatch(sym, name) }, watching ? '★ Watching' : '☆ Watch'), loadBtn)));

  const trades = lab.txns.filter((t) => (t.type === 'buy' || t.type === 'sell') && sameSym(t, sym)).map((t) => ({ date: t.date, side: t.type, qty: t.qty, price: t.price }));
  const bs = books(), held = bs.flatMap((b) => b.v.holdings.filter((p) => p.symbol === sym)), hq = held.reduce((a, p) => a + p.qty, 0), avg = hq ? held.reduce((a, p) => a + p.cost, 0) / hq : null;
  const chartBlock = rec && rec.hist ? section('Price chart', chartCard(sym, rec, trades, avg, lab, yahoo)) : section('Price chart', h('div', { class: 'sp-nochart' },
    h('p', null, S.remote ? 'No chart yet. One press brings the last five years of daily prices and the company’s key figures from Yahoo Finance. It is kept on this device and never refreshes by itself.' : 'Charts and company figures need the Google Drive backend. Connect it in Settings.'),
    S.remote ? h('button', { type: 'button', class: 'primary', onclick: (e) => loadData(e.currentTarget, sym, yahoo) }, 'Load chart & fundamentals') : h('a', { class: 'btn primary', href: '#/settings' }, 'Open Settings')));

  root.append(h('div', { class: 'sp-grid' },
    h('div', { class: 'sp-main' }, chartBlock, statsCard(sym, q, rec), tradesCard(sym, lab)),
    h('aside', { class: 'sp-side', id: 'tp' }, h('section', { class: 'card tp-card' }, h('h2', { class: 'tp-title' }, 'Trade ' + sym), panel.el), positionCard(sym, q, lab))));
  // phone: a fixed Buy / Sell bar that jumps to the panel
  root.append(h('div', { class: 'sp-bar' }, h('button', { type: 'button', class: 'tp-go buy', onclick: () => { panel.setSide('buy'); document.getElementById('tp').scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, 'Buy'), h('button', { type: 'button', class: 'tp-go sell', onclick: () => { panel.setSide('sell'); document.getElementById('tp').scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, 'Sell')));
  return root;
}
