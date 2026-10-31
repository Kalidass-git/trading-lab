// Trading Lab: dashboard. Summary cards, performance chart, accounts and recent activity.
import { S } from '../store.js';
import * as BK from '../lab/book.js';
import { h, money, pct, num, dateStr, section, stat, table, btn, rowList, empty } from '../ui.js';
import { lineChart } from '../charts.js';
import { LAB, st, books, selBooks, tone, signedRs, activeAccounts, setAcct, rerender, quote, rs2 } from './lab-shared.js';
import { ticket, accountForm } from './lab-trade.js';

let range = '3M';
const RANGES = [['1W', 7], ['1M', 31], ['3M', 92], ['6M', 183], ['1Y', 366], ['All', 0]];

function welcome() {
  return h('div', { class: 'card lab-empty' },
    h('h2', null, 'Start paper trading'),
    h('p', null, 'Create a virtual account with some starting capital, then buy and sell shares at live market prices. Nothing here uses real money.'),
    h('div', { class: 'row' }, btn('New trading account', () => accountForm(), 'primary')),
    S.remote ? null : h('p', { class: 'note' }, 'Your data is only on this device. Connect your Google Drive backend in Settings to keep it safe and use it on other devices.'));
}

export function render() {
  const lab = LAB(), root = h('div', { class: 'page' });
  if (!activeAccounts(lab).length) { root.append(welcome()); return root; }
  const all = books(), sel = selBooks(all), t = BK.totals(sel);
  root.append(h('div', { class: 'stats lab-stats' },
    stat('Virtual capital', money(t.capital), `${sel.length} account${sel.length === 1 ? '' : 's'} · cash ${money(t.cash)}`),
    stat('Current value', money(t.value), t.unpriced ? `${t.unpriced} holding${t.unpriced === 1 ? '' : 's'} without a price` : 'cash + holdings'),
    stat('Total P&L', h('span', { class: tone(t.pnl) }, signedRs(t.pnl)), `realised ${signedRs(t.realized)} · open ${signedRs(t.unrealized)}`),
    stat('Return', h('span', { class: tone(t.pnl) }, (t.pnl > 0 ? '+' : '') + pct(t.ret, 2)), 'on capital put in'),
    stat('Today’s P&L', h('span', { class: tone(t.day) }, signedRs(t.day)), 'since yesterday’s close'),
    stat('Active positions', String(t.positions), `charges paid ${money(t.fees)}`)));

  // performance chart from the daily readings
  const pts = BK.curve(lab, sel.map((b) => b.acct.id));
  const days = (RANGES.find((r) => r[0] === range) || RANGES[2])[1];
  const cut = days ? new Date(Date.now() - days * 864e5).toISOString().slice(0, 10) : '';
  const shown = pts.filter((p) => !cut || p.date >= cut);
  root.append(section('Performance', h('div', null,
    h('div', { class: 'chipset-inline' }, RANGES.map(([k]) => h('button', { type: 'button', class: 'chipopt' + (k === range ? ' on' : ''), 'aria-pressed': String(k === range), onclick: () => { range = k; rerender(); } }, k))),
    shown.length >= 2
      ? lineChart({ labels: shown.map((p) => dateStr(p.date).replace(/ \d{4}$/, '')), tipLabels: shown.map((p) => dateStr(p.date)), series: [{ name: 'Account value', values: shown.map((p) => p.value) }, { name: 'Profit / loss', values: shown.map((p) => p.pnl), dashed: true }], fmt: money, area: true, yMin: Math.min(0, ...shown.map((p) => p.pnl)) })
      : h('p', { class: 'empty' }, 'The chart fills in as days pass. Each day you refresh prices or trade adds one point.'))));

  if (st.acct === 'all' && sel.length > 1) {
    root.append(section('Accounts', table([
      { label: 'Account', host: true, get: (b) => b.acct.name },
      { label: 'Capital', cls: 'r', get: (b) => money(b.v.deposited), total: () => money(t.capital) },
      { label: 'Value', cls: 'r', get: (b) => money(b.v.value), total: () => money(t.value) },
      { label: 'P&L', cls: 'r', render: (b) => h('span', { class: tone(b.v.pnl) }, signedRs(b.v.pnl)), total: () => h('span', { class: tone(t.pnl) }, signedRs(t.pnl)) },
      { label: 'Return', cls: 'r', render: (b) => h('span', { class: tone(b.v.pnl) }, pct(b.v.ret, 1)) },
      { label: 'Today', cls: 'r', render: (b) => h('span', { class: tone(b.v.day) }, signedRs(b.v.day)), total: () => h('span', { class: tone(t.day) }, signedRs(t.day)) },
    ], sel, { footer: { label: 'Total' }, onRow: (b) => { setAcct(b.acct.id); rerender(); }, m: { key: 'tl-accts', head: 'Account', sub: (b) => `${b.v.positions} position${b.v.positions === 1 ? '' : 's'}`, views: [['Value', 'Capital'], ['P&L', 'Return'], ['Today']] } })));
  }

  const ids = new Set(sel.map((b) => b.acct.id));
  const recent = BK.tradeRows(lab).filter((r) => ids.has(r.acct)).slice(0, 8);
  root.append(section('Recent activity', recent.length ? rowList(recent.map((r) => ({
    title: r.type === 'deposit' || r.type === 'withdraw' ? r.typeLabel : `${r.typeLabel} · ${r.name || r.symbol}`,
    sub: `${dateStr(r.date)} · ${r.account}` + (r.qty !== '' ? ` · ${num(r.qty)} @ ${rs2(Number(r.price))}` : ''),
    value: money(r.amount), valueSub: r.realized !== '' ? h('span', { class: tone(r.realized) }, 'P&L ' + signedRs(r.realized)) : null }))) : empty('No trades yet. Place your first order.'),
    [btn('Buy / sell', () => ticket(), 'primary'), h('a', { class: 'btn small', href: '#/stocks/activity' }, 'All activity')]));
  return root;
}
