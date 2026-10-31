// Trading Lab: reports. Trades, symbols, strategies and accounts, with filters, sorting and CSV / Excel export.
import * as BK from '../lab/book.js';
import { workbook } from '../lab/xlsxout.js';
import { h, money, pct, num, dateStr, section, table, btn, segTabs, subTab, toast, empty, stat } from '../ui.js';
import { sortFilterBar } from '../mobilebar.js';
import { LAB, st, books, selBooks, tone, signedRs, rerender, quote, rs2, download, activeAccounts } from './lab-shared.js';

const TABS = [['trades', 'Trades'], ['symbols', 'Shares'], ['strategies', 'Strategies'], ['accounts', 'Accounts']];
const f = { from: '', to: '', strategy: 'all', type: 'all', q: '', sort: 'date', dir: 'desc' };
const SORTS = [{ value: 'date', label: 'Date', kind: 'date' }, { value: 'amount', label: 'Amount', kind: 'num' }, { value: 'realized', label: 'Realised P&L', kind: 'num' }, { value: 'symbol', label: 'Share', kind: 'text' }];

const tradeData = () => {
  const rows = BK.tradeRows(LAB(), { acct: st.acct, from: f.from, to: f.to, strategy: f.strategy, type: f.type, q: f.q });
  const sign = f.dir === 'asc' ? 1 : -1, key = f.sort;
  return rows.slice().sort((a, b) => { const x = key === 'symbol' ? a.symbol : key === 'amount' ? Number(a.amount) : key === 'realized' ? Number(a.realized || 0) : a.date + a.ts, y = key === 'symbol' ? b.symbol : key === 'amount' ? Number(b.amount) : key === 'realized' ? Number(b.realized || 0) : b.date + b.ts; return sign * (typeof x === 'string' ? x.localeCompare(y) : x - y); });
};
const accountRows = (sel) => sel.map((b) => ({ account: b.acct.name, status: b.acct.archived ? 'Archived' : 'Active', capital: b.v.deposited, cash: b.v.cash, holdings: b.v.holdingsValue, options: b.v.optionsValue, value: b.v.value, pnl: b.v.pnl, ret: Math.round(b.v.ret * 10000) / 100, realized: b.v.realized, unrealized: b.v.unrealized, fees: b.v.fees, today: b.v.day, positions: b.v.positions }));
const ACOLS = [['account', 'Account'], ['status', 'Status'], ['capital', 'Capital'], ['cash', 'Cash'], ['holdings', 'Holdings value'], ['options', 'Options value'], ['value', 'Current value'], ['pnl', 'Total P&L'], ['ret', 'Return %'], ['realized', 'Realised P&L'], ['unrealized', 'Open P&L'], ['fees', 'Charges'], ['today', 'Today'], ['positions', 'Positions']];
const SCOLS = [['symbol', 'Share'], ['orders', 'Orders'], ['bought', 'Bought'], ['sold', 'Sold'], ['realized', 'Realised P&L'], ['fees', 'Charges'], ['open', 'Open quantity'], ['unrealized', 'Open P&L']];
const STCOLS = [['strategy', 'Strategy'], ['orders', 'Orders'], ['spent', 'Money spent'], ['back', 'Money back'], ['fees', 'Charges'], ['value', 'Open value'], ['pnl', 'Profit / loss'], ['ret', 'Return %']];
const strategyRows = (sel) => Object.entries(BK.strategyPnl(LAB(), quote, Date.now(), new Set(sel.map((b) => b.acct.id)))).map(([k, s]) => ({ strategy: k, ...s, ret: Math.round(s.ret * 10000) / 100 }));

function exportBar(tab, rows, cols, name) {
  const date = new Date().toISOString().slice(0, 10);
  return h('div', { class: 'row' },
    btn('Download CSV', () => { if (!rows.length) return toast('Nothing to export.', 'bad'); download(`trading-lab-${name}-${date}.csv`, BK.toCsv(cols, rows)); }),
    btn('Download Excel', () => {
      const sel = selBooks(), sheets = [{ name: 'Trades', cols: BK.COLS.trades, rows: tradeData() }, { name: 'Shares', cols: SCOLS, rows: BK.symbolSummary(tradeData(), sel) }, { name: 'Strategies', cols: STCOLS, rows: strategyRows(sel) }, { name: 'Accounts', cols: ACOLS, rows: accountRows(sel) }];
      download(`trading-lab-report-${date}.xlsx`, new Blob([workbook(sheets)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    }));
}

function filters() {
  const bar = sortFilterBar({ sort: { options: SORTS, value: f.sort, dir: f.dir, apply: (v, d) => { f.sort = v; f.dir = d; rerender(); } },
    filters: { fields: [{ key: 'strategy', label: 'Strategy', type: 'select', default: 'all', options: [{ value: 'all', label: 'All' }, ...['Stocks', 'Baskets', 'Options', 'Cash'].map((v) => ({ value: v, label: v }))] }, { key: 'type', label: 'Order type', type: 'select', default: 'all', options: [{ value: 'all', label: 'All' }, { value: 'trades', label: 'Trades only' }, { value: 'buy', label: 'Buys' }, { value: 'sell', label: 'Sells' }, { value: 'obuy', label: 'Option buys' }, { value: 'osell', label: 'Option sells' }, { value: 'oexp', label: 'Option expiries' }, { value: 'deposit', label: 'Deposits' }, { value: 'withdraw', label: 'Withdrawals' }] }],
      values: { strategy: f.strategy, type: f.type }, apply: (v) => { f.strategy = v.strategy; f.type = v.type; rerender(); } } });
  const sel = (key, opts) => h('select', { 'aria-label': key, onchange: (e) => { f[key] = e.target.value; rerender(); } }, opts.map(([v, l]) => h('option', { value: v, selected: v === f[key] }, l)));
  return h('div', { class: 'tbl-tools lab-filters' }, bar,
    h('label', { class: 'inline-label' }, 'From ', h('input', { type: 'date', value: f.from, onchange: (e) => { f.from = e.target.value; rerender(); } })),
    h('label', { class: 'inline-label' }, 'To ', h('input', { type: 'date', value: f.to, onchange: (e) => { f.to = e.target.value; rerender(); } })),
    h('span', { class: 'desk-ctl lab-dfilters' }, sel('strategy', [['all', 'All strategies'], ['Stocks', 'Stocks'], ['Baskets', 'Baskets'], ['Options', 'Options'], ['Cash', 'Cash']]), ' ', sel('type', [['all', 'All types'], ['trades', 'Trades only'], ['buy', 'Buys'], ['sell', 'Sells'], ['obuy', 'Option buys'], ['osell', 'Option sells'], ['oexp', 'Option expiries'], ['deposit', 'Deposits'], ['withdraw', 'Withdrawals']]), ' ',
      h('label', { class: 'inline-label' }, 'Sort ', h('select', { onchange: (e) => { f.sort = e.target.value; rerender(); } }, SORTS.map((o) => h('option', { value: o.value, selected: o.value === f.sort }, o.label))), h('select', { 'aria-label': 'Direction', onchange: (e) => { f.dir = e.target.value; rerender(); } }, [['desc', 'Descending'], ['asc', 'Ascending']].map(([v, l]) => h('option', { value: v, selected: v === f.dir }, l))))),
    h('input', { type: 'search', placeholder: 'Find a share or note', value: f.q, 'aria-label': 'Search trades', oninput: (e) => { f.q = e.target.value; clearTimeout(window.__tlq2); window.__tlq2 = setTimeout(() => { rerender(); const i = document.querySelector('input[aria-label="Search trades"]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 250); } }),
    (f.from || f.to || f.strategy !== 'all' || f.type !== 'all' || f.q) ? h('button', { type: 'button', class: 'small', onclick: () => { Object.assign(f, { from: '', to: '', strategy: 'all', type: 'all', q: '' }); rerender(); } }, 'Clear filters') : null);
}

export function render() {
  const root = h('div', { class: 'page' }), tab = subTab(TABS.map((t) => t[0])), sel = selBooks();
  root.append(segTabs(TABS, tab, 'Report views'));
  if (!activeAccounts(LAB()).length && !LAB().accounts.length) { root.append(empty('Create a trading account to see reports.')); return root; }
  if (tab === 'trades') {
    const rows = tradeData(), realized = rows.reduce((a, r) => a + (r.realized === '' ? 0 : Number(r.realized)), 0), fees = rows.reduce((a, r) => a + (Number(r.fees) || 0), 0), trades = rows.filter((r) => r.strategy !== 'Cash').length;
    root.append(h('div', { class: 'stats' }, stat('Orders', String(trades), `${rows.length} lines in all`), stat('Realised P&L', h('span', { class: tone(realized) }, signedRs(realized)), 'from sells and expiries here'), stat('Charges', money(fees), 'brokerage and taxes')));
    root.append(section('Trades', h('div', null, filters(), table([
      { label: 'Date', mob: 'under', get: (r) => dateStr(r.date) }, { label: 'Order', host: true, render: (r) => h('span', null, r.typeLabel + (r.name || r.symbol ? ' · ' + (r.name || r.symbol) : ''), r.basket ? h('small', { class: 'tag' }, r.basket) : null) },
      { label: 'Account', mob: 'under', get: (r) => r.account }, { label: 'Strategy', show: 'desk', get: (r) => r.strategy },
      { label: 'Quantity', cls: 'r', get: (r) => (r.qty === '' ? '' : num(r.qty)) }, { label: 'Price', cls: 'r', get: (r) => (r.price === '' ? '' : rs2(Number(r.price))) },
      { label: 'Amount', cls: 'r', get: (r) => money(r.amount) }, { label: 'Charges', cls: 'r', show: 'desk', get: (r) => (r.fees ? rs2(r.fees) : '') },
      { label: 'Realised P&L', cls: 'r', render: (r) => (r.realized === '' ? '' : h('span', { class: tone(r.realized) }, signedRs(r.realized))), total: () => h('span', { class: tone(realized) }, signedRs(realized)) },
    ], rows.slice(0, 500), { footer: { label: 'Total' }, empty: 'No trades match these filters.', m: { key: 'tl-rep', head: 'Order', sub: ['Date', 'Account'], views: [['Amount', 'Realised P&L'], ['Price', 'Quantity'], ['Strategy', 'Charges']] } }),
      rows.length > 500 ? h('p', { class: 'note' }, `Showing 500 of ${rows.length}. The download has every line.`) : null), [exportBar(tab, rows, BK.COLS.trades, 'trades')]));
  } else if (tab === 'symbols') {
    const rows = BK.symbolSummary(tradeData(), sel).sort((a, b) => b.realized + b.unrealized - (a.realized + a.unrealized));
    root.append(section('By share', h('div', null, filters(), table([
      { label: 'Share', host: true, get: (r) => r.symbol }, { label: 'Orders', cls: 'r', mob: 'under', mlabel: '', get: (r) => String(r.orders) },
      { label: 'Bought', cls: 'r', get: (r) => money(r.bought) }, { label: 'Sold', cls: 'r', get: (r) => money(r.sold) },
      { label: 'Realised P&L', cls: 'r', render: (r) => h('span', { class: tone(r.realized) }, signedRs(r.realized)) }, { label: 'Open P&L', cls: 'r', render: (r) => h('span', { class: tone(r.unrealized) }, signedRs(r.unrealized)) }, { label: 'Charges', cls: 'r', show: 'desk', get: (r) => rs2(r.fees) },
    ], rows, { empty: 'No trades match these filters.', m: { key: 'tl-sym', head: 'Share', sub: ['Orders'], views: [['Realised P&L', 'Open P&L'], ['Bought', 'Sold']] } }),
      h('p', { class: 'note' }, 'Open P&L is for what you hold now in the chosen accounts; the filters above apply to the orders counted.')), [exportBar(tab, rows, SCOLS, 'shares')]));
  } else if (tab === 'strategies') {
    const rows = strategyRows(sel);
    root.append(section('Stocks vs baskets vs options', h('div', null, table([
      { label: 'Strategy', host: true, get: (r) => r.strategy }, { label: 'Orders', cls: 'r', mob: 'under', mlabel: '', get: (r) => String(r.orders) },
      { label: 'Money spent', cls: 'r', get: (r) => money(r.spent) }, { label: 'Money back', cls: 'r', get: (r) => money(r.back) }, { label: 'Open value', cls: 'r', get: (r) => money(r.value) },
      { label: 'Profit / loss', cls: 'r', render: (r) => h('span', { class: tone(r.pnl) }, signedRs(r.pnl)) }, { label: 'Return %', cls: 'r', render: (r) => h('span', { class: tone(r.pnl) }, (r.ret > 0 ? '+' : '') + r.ret.toFixed(1) + '%') },
    ], rows, { m: { key: 'tl-strat', head: 'Strategy', sub: ['Orders'], views: [['Profit / loss', 'Return %'], ['Money spent', 'Money back'], ['Open value']] } }),
      h('p', { class: 'note' }, 'Profit is open value plus money back minus money spent, charges included. Orders placed through a basket count under Baskets. Date filters do not apply here.')), [exportBar(tab, rows, STCOLS, 'strategies')]));
  } else {
    const rows = accountRows(books({ archived: true }).filter((b) => st.acct === 'all' || b.acct.id === st.acct));
    root.append(section('Account comparison', h('div', null, table([
      { label: 'Account', host: true, render: (r) => h('span', null, r.account, r.status === 'Archived' ? h('small', { class: 'tag' }, 'archived') : null) },
      { label: 'Capital', cls: 'r', get: (r) => money(r.capital) }, { label: 'Current value', cls: 'r', get: (r) => money(r.value) },
      { label: 'P&L', cls: 'r', render: (r) => h('span', { class: tone(r.pnl) }, signedRs(r.pnl)) }, { label: 'Return', cls: 'r', render: (r) => h('span', { class: tone(r.pnl) }, (r.ret > 0 ? '+' : '') + r.ret.toFixed(2) + '%') },
      { label: 'Realised', cls: 'r', show: 'desk', render: (r) => h('span', { class: tone(r.realized) }, signedRs(r.realized)) }, { label: 'Open', cls: 'r', show: 'desk', render: (r) => h('span', { class: tone(r.unrealized) }, signedRs(r.unrealized)) },
      { label: 'Charges', cls: 'r', show: 'desk', get: (r) => money(r.fees) }, { label: 'Today', cls: 'r', render: (r) => h('span', { class: tone(r.today) }, signedRs(r.today)) },
    ], rows, { empty: 'No accounts.', m: { key: 'tl-acmp', head: 'Account', views: [['P&L', 'Return'], ['Current value', 'Capital'], ['Today']] } })), [exportBar(tab, rows, ACOLS, 'accounts')]));
  }
  return root;
}
