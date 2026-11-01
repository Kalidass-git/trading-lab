// Trading Lab performance measures: XIRR, closed trades, equity curve, index comparison, findings. node tests/lab-perf.test.mjs
import * as M from '../js/lab/model.js';
import * as P from '../js/lab/perf.js';
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } else console.log('ok  ', m); };
const near = (a, b, e = 1e-4) => Math.abs(a - b) <= e;
// XIRR: 1000 in, 1100 back exactly one year (365 days) later is 10%
ok(near(P.xirr([{ date: '2025-01-01', amount: -1000 }, { date: '2026-01-01', amount: 1100 }]), 0.1), 'XIRR: 1000 grows to 1100 in a year = 10%');
ok(near(P.xirr([{ date: '2025-01-01', amount: -1000 }, { date: '2025-07-02', amount: -1000 }, { date: '2026-01-01', amount: 2300 }]), 0.202937, 1e-4), 'XIRR with two deposits (matches an independent bisection in Python: 20.29%)');
ok(near(P.xirr([{ date: '2025-01-01', amount: -1000 }, { date: '2026-01-01', amount: 800 }]), -0.2), 'XIRR: a loss gives a negative rate');
ok(P.xirr([{ date: '2026-01-01', amount: -1000 }, { date: '2026-01-02', amount: 1100 }]) === null, 'XIRR: under 30 days of history is not annualised');
ok(P.xirr([{ date: '2025-01-01', amount: -1000 }]) === null && P.xirr([{ date: '2025-01-01', amount: -1000 }, { date: '2025-01-01', amount: 1100 }]) === null, 'XIRR: one-sided or same-day flows give nothing');
// a small ledger
const lab = M.emptyLab(); lab.accounts.push({ id: 'a', name: 'A', fees: {} });
const add = (o) => M.addTxn(lab, { acct: 'a', ...o });
add({ type: 'deposit', date: '2026-01-01', amount: 100000 });
add({ type: 'buy', date: '2026-01-05', symbol: 'AAA', qty: 100, price: 100 });      // 10,000
add({ type: 'buy', date: '2026-01-15', symbol: 'BBB', qty: 100, price: 200 });      // 20,000
add({ type: 'sell', date: '2026-02-04', symbol: 'AAA', qty: 100, price: 120 });     // +2,000, held 30 days
add({ type: 'sell', date: '2026-03-16', symbol: 'BBB', qty: 100, price: 150 });     // -5,000, held 60 days
add({ type: 'buy', date: '2026-03-20', symbol: 'CCC', qty: 10, price: 1000, basket: 'bk' });
const closed = P.closedTrades([lab.txns]);
ok(closed.length === 2 && closed[0].symbol === 'AAA' && closed[0].gain === 2000 && Math.round(closed[0].held) === 30, 'closed trades: profit and days held (AAA +2,000 after 30 days)');
ok(closed[1].gain === -5000 && Math.round(closed[1].held) === 60 && near(closed[1].ret, -0.25), 'closed trades: BBB -5,000 after 60 days, -25%');
const st = P.tradeStats(closed);
ok(st.n === 2 && st.wins === 1 && st.losses === 1 && st.winRate === 0.5 && st.avgWin === 2000 && st.avgLoss === 5000 && near(st.payoff, 0.4) && near(st.profitFactor, 0.4) && st.expectancy === -1500, 'trade statistics: win rate, average win/loss, payoff, profit factor, expectancy');
ok(Math.round(st.holdWin) === 30 && Math.round(st.holdLoss) === 60 && st.best.symbol === 'AAA' && st.worst.symbol === 'BBB', 'holding periods and best / worst trade');
ok(P.monthlyRealised(closed).length === 2 && P.bySymbol(closed)[0].symbol === 'AAA', 'monthly profit and by-share profit');
// partial sells keep the average buy date
const l2 = M.emptyLab(); l2.accounts.push({ id: 'p', name: 'P', fees: {} });
const A2 = (o) => M.addTxn(l2, { acct: 'p', ...o });
A2({ type: 'deposit', date: '2026-01-01', amount: 50000 }); A2({ type: 'buy', date: '2026-01-01', symbol: 'X', qty: 10, price: 100 }); A2({ type: 'buy', date: '2026-01-21', symbol: 'X', qty: 10, price: 100 });
A2({ type: 'sell', date: '2026-02-10', symbol: 'X', qty: 10, price: 110 });
ok(Math.round(P.closedTrades([l2.txns])[0].held) === 30, 'holding days use the quantity-weighted average buy date (avg Jan 11 -> Feb 10 = 30)');
// portfolio xirr and per share
const flows = P.externalFlows(lab.txns);
ok(flows.length === 1 && flows[0].amount === -100000, 'external flows are the deposits');
const val = M.replay(lab.txns); const open = 10 * 1100;
const totalValue = val.cash + open;
const px = P.portfolioXirr(lab.txns, totalValue, '2026-04-01');
ok(px != null && px < 0 && near(totalValue, 100000 - 3000 + 1000), 'portfolio XIRR is negative after a net loss on the closed trades');
ok(P.symbolXirr(lab.txns, 'AAA', 0, '2026-04-01') > 1, 'XIRR of a share bought and sold: +20% in 30 days annualises high');
ok(P.historyDays(lab.txns, '2026-04-01') === 90, 'history length in days');
// equity curve from price history
const closeOn = (s, d) => ({ AAA: 100, BBB: 200, CCC: 1000 }[s] ?? null);
const curve = P.equityCurve([lab.txns], closeOn, () => ({ price: 1100 }), '2026-04-01');
ok(curve.points[0].date === '2026-01-01' && curve.points[0].value === 100000 && curve.points.at(-1).date === '2026-04-01', 'equity curve starts with the deposit and ends today');
ok(curve.points.at(-1).value === totalValue, 'the last point equals the account value at today’s price');
ok(!curve.approx && curve.missing.length === 0, 'history available for every share: the curve is exact');
const noHist = P.equityCurve([lab.txns], () => null, (s) => (s === 'CCC' ? { price: 1100 } : null), '2026-04-01');
ok(noHist.approx && noHist.missing.includes('AAA') && noHist.missing.includes('BBB'), 'without history the curve is marked approximate and names the missing shares');
const cs = P.curveStats([{ date: 'a', value: 100, deposited: 100 }, { date: 'b', value: 120, deposited: 100 }, { date: 'c', value: 90, deposited: 100 }, { date: 'd', value: 190, deposited: 200 }]);
ok(near(cs.maxDrawdown, -0.25) && near(cs.twr, -0.1) && cs.ddTo === 'c' && cs.ddFrom === 'b', 'curve statistics: worst fall from the peak (-25%) and time-weighted return (-10%); cash added is not profit');
// index comparison: same deposit into an index that doubles
const bm = P.benchmark(lab.txns, (d) => (d === '2026-01-01' ? 1000 : 2000), '2026-04-01');
ok(bm.value === 200000 && bm.pnl === 100000 && bm.xirr > 1, 'index comparison: the same deposit in an index that doubled');
ok(P.benchmark(lab.txns, () => null, '2026-04-01') === null, 'index comparison needs index prices');
const bs = P.benchmarkSeries([{ date: 'a', deposited: 1000 }, { date: 'b', deposited: 1000 }, { date: 'c', deposited: 3000 }], (d) => ({ a: 10, b: 20, c: 20 }[d]));
ok(bs[0] === 1000 && bs[1] === 2000 && bs[2] === 4000, 'index series: 1,000 at 10 doubles to 2,000; another 2,000 added at 20 buys 100 more units, 200 units at 20 = 4,000');
// findings
const f = P.findings({ stats: st, xirr: -0.3, days: 60, bench: bm, totals: { pnl: -3000 }, holdings: [{ symbol: 'CCC', value: 11000 }], strategies: {}, cashPct: 0.1, feesPct: 0 });
ok(f.some((x) => x.title === 'Small sample') && f.some((x) => x.title === 'Behind the index') && f.some((x) => x.title === 'Short history'), 'findings mention the small sample, a short history and being behind the index');
ok(f.every((x) => x.tone && x.title && x.text) && !f.some((x) => /win|Win|Losing|Profit factor/.test(x.title)), 'every finding has a tone, title and text; with 2 trades no win-rate verdicts are given');
const g = P.findings({ stats: P.tradeStats(Array.from({ length: 12 }, (_, i) => ({ gain: i < 8 ? 100 : -300, ret: 0, held: i < 8 ? 5 : 40, date: '2026-01-01' }))), xirr: 0.1, days: 200, bench: null, totals: { pnl: 0 }, holdings: [], strategies: {}, cashPct: 0.5 });
ok(g.some((x) => x.title === 'You win often but lose bigger') && g.some((x) => x.title === 'Losers are held longer than winners') && g.some((x) => x.title === 'A lot of idle cash'), 'findings: wins often but loses bigger, holds losers longer, idle cash');
console.log(bad ? bad + ' failed' : 'all passed'); process.exit(bad ? 1 : 0);
