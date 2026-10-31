// Trading Lab: snapshots, report rows, strategy comparison and CSV. node tests/lab-book.test.mjs
import * as M from '../js/lab/model.js';
import * as B from '../js/lab/book.js';
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } else console.log('ok  ', m); };
const lab = M.emptyLab();
lab.accounts.push({ id: 'a', name: 'Alpha', fees: {} }, { id: 'b', name: 'Beta, "swing"', fees: {} });
lab.baskets.push({ id: 'bk', name: 'Core', items: [] });
const add = (o) => M.addTxn(lab, o);
add({ acct: 'a', type: 'deposit', date: '2026-10-01', amount: 100000 });
add({ acct: 'b', type: 'deposit', date: '2026-10-01', amount: 50000 });
add({ acct: 'a', type: 'buy', date: '2026-10-02', symbol: 'TCS', qty: 10, price: 4000, fees: 10 });
add({ acct: 'a', type: 'buy', date: '2026-10-02', symbol: 'INFY', qty: 20, price: 1500, fees: 10, basket: 'bk' });
add({ acct: 'a', type: 'sell', date: '2026-10-09', symbol: 'TCS', qty: 5, price: 4400, fees: 10 });
add({ acct: 'b', type: 'obuy', date: '2026-10-03', qty: 75, price: 100, fees: 5, opt: { underlying: 'NIFTY', kind: 'call', strike: 25000, expiry: '2026-11-25', lot: 75 } });
const now = Date.parse('2026-10-12T06:00:00Z');
const quote = (s) => ({ TCS: { price: 4300, prevClose: 4250 }, INFY: { price: 1600, prevClose: 1590 }, NIFTY: { price: 25200, prevClose: 25100 } }[s] || null);
const books = B.allBooks(lab, quote, now);
const t = B.totals(books);
ok(books.length === 2 && t.capital === 150000, 'two accounts, capital added up');
ok(t.value === books[0].v.value + books[1].v.value && Math.abs(t.pnl - (t.value - 150000)) < 1e-9, 'total value and profit across accounts');
ok(books[1].v.options.length === 1 && books[1].v.options[0].source === 'model' && books[1].v.optionsValue > 0, 'the option is valued by the model from the underlying');
const marked = JSON.parse(JSON.stringify(lab)); marked.marks.push({ id: 'NIFTY|call|25000|2026-11-25', premium: 250 });
ok(B.accountBook(marked, marked.accounts[1], quote, now).v.optionsValue === 75 * 250, 'a premium you enter replaces the estimate');
// snapshots
ok(B.upsertSnaps(lab, quote, now) === true && lab.snaps.length === 2, 'one reading per account per day');
ok(B.upsertSnaps(lab, quote, now) === false && lab.snaps.length === 2, 'a second refresh the same day with the same prices changes nothing');
const later = Date.parse('2026-10-13T06:00:00Z'); B.upsertSnaps(lab, (s) => ({ ...quote(s), price: (quote(s) || {}).price * 1.01 }), later);
ok(lab.snaps.length === 4 && B.curve(lab, ['a', 'b']).length === 2, 'the next day adds readings; the curve has one point per day');
ok(B.curve(lab, ['a']).length === 2 && B.curve(lab, ['a'])[0].value === books[0].v.value, 'a curve for one account');
// rows and filters
const rows = B.tradeRows(lab);
ok(rows.length === 6 && rows[0].date >= rows[rows.length - 1].date, 'every transaction is a row, newest first');
ok(rows.find((r) => r.type === 'sell').realized === 5 * 4400 - 10 - (5 * 4000 + 5), 'the sell row carries its realised profit (charges included)');
ok(B.tradeRows(lab, { acct: 'b' }).length === 2 && B.tradeRows(lab, { strategy: 'Baskets' }).length === 1 && B.tradeRows(lab, { strategy: 'Options' }).length === 1, 'filters: account and strategy');
ok(B.tradeRows(lab, { from: '2026-10-05' }).length === 1 && B.tradeRows(lab, { q: 'infy' }).length === 1 && B.tradeRows(lab, { type: 'trades' }).length === 4, 'filters: dates, search, trades only');
// strategy comparison
const sp = B.strategyPnl(lab, quote, now);
ok(sp.Baskets.spent === 30010 && sp.Baskets.value === 32000 && sp.Baskets.pnl === 1990 && sp.Baskets.orders === 1, 'basket orders: spent 30,010, now worth 32,000');
ok(sp.Stocks.spent === 40010 && sp.Stocks.back === 21990 && sp.Stocks.value === 21500 && sp.Stocks.pnl === 3480, 'stock orders: 5 TCS sold, 5 still held');
ok(sp.Options.spent === 7505 && sp.Options.orders === 1 && sp.Options.value > 0, 'option orders');
ok(B.strategyPnl(lab, quote, now, new Set(['b'])).Stocks.orders === 0 && B.strategyPnl(lab, quote, now, new Set(['b'])).Options.orders === 1, 'strategy comparison can be limited to chosen accounts');
// symbols
const ss = B.symbolSummary(rows, books);
ok(ss.find((s) => s.symbol === 'TCS').realized === 5 * 4400 - 10 - (5 * 4000 + 5) && ss.find((s) => s.symbol === 'TCS').open === 5, 'by symbol');
// csv
const csv = B.toCsv(B.COLS.trades, B.tradeRows(lab, { acct: 'b' }));
ok(csv.startsWith('﻿Date,Account') && csv.includes('"Beta, ""swing"""') && csv.split('\r\n').length === 4, 'CSV quotes commas and quotes, starts with a BOM, one line per row');
console.log(bad ? bad + ' failed' : 'all passed'); process.exit(bad ? 1 : 0);
