// Trading Lab accounting: cash, average cost, realised and unrealised profit, validation, baskets. No data file needed.
// node tests/lab-model.test.mjs
import * as M from '../js/lab/model.js';
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } else console.log('ok  ', m); };
const throws = (f) => { try { f(); return null; } catch (e) { return e.message; } };
const lab = M.emptyLab();
lab.accounts.push({ id: 'a1', name: 'Swing', capital: 100000, archived: false, fees: { brokeragePct: 0.1, flat: 20, otherPct: 0.05 } });
const A = (o) => M.addTxn(lab, { acct: 'a1', ...o });
A({ type: 'deposit', date: '2026-10-01', amount: 100000 });
ok(M.feeFor(lab.accounts[0].fees, 10000) === 35, 'charges: 0.1% + 0.05% of 10,000 plus a flat 20 = 35');
A({ type: 'buy', date: '2026-10-02', symbol: 'tcs', qty: 10, price: 4000, fees: 100 });
let rp = M.replay(lab.txns);
ok(rp.cash === 100000 - 40000 - 100, 'a buy takes the value and the charges out of cash');
ok(rp.holdings.length === 1 && rp.holdings[0].symbol === 'TCS' && rp.holdings[0].cost === 40100 && rp.holdings[0].avg === 4010, 'charges on a buy are part of the cost (average 4,010)');
A({ type: 'buy', date: '2026-10-05', symbol: 'TCS', qty: 10, price: 4200, fees: 100 });
rp = M.replay(lab.txns);
ok(rp.holdings[0].qty === 20 && rp.holdings[0].cost === 82200 && rp.holdings[0].avg === 4110, 'a second buy averages the cost');
A({ type: 'sell', date: '2026-10-08', symbol: 'TCS', qty: 5, price: 4500, fees: 50 });
rp = M.replay(lab.txns);
ok(Math.abs(rp.realized - ((5 * 4500 - 50) - 5 * 4110)) < 1e-9 && rp.realized === 22450 - 20550, 'a sell realises proceeds after charges minus average cost');
ok(rp.holdings[0].qty === 15 && rp.holdings[0].cost === 61650, 'the rest keeps the average cost');
ok(rp.cash === 100000 - 40100 - 42100 + 22450, 'cash after the three orders');
ok(rp.fees === 250, 'charges are totalled');
// validation: nothing is stored when it fails
const n0 = lab.txns.length;
ok(/not enough cash/.test(throws(() => A({ type: 'buy', date: '2026-10-09', symbol: 'INFY', qty: 1000, price: 1500 }))) && lab.txns.length === n0, 'a buy above the cash is refused and not stored');
ok(/only 15 held/.test(throws(() => A({ type: 'sell', date: '2026-10-09', symbol: 'TCS', qty: 16, price: 4500 }))), 'selling more than held is refused (no shorting)');
ok(/whole number/.test(throws(() => A({ type: 'buy', date: '2026-10-09', symbol: 'TCS', qty: 1.5, price: 4500 }))), 'fractional shares are refused');
ok(/above zero/.test(throws(() => A({ type: 'buy', date: '2026-10-09', symbol: 'TCS', qty: 1, price: 0 }))), 'a zero price is refused');
ok(/valid date/.test(throws(() => A({ type: 'buy', date: '09/10/2026', symbol: 'TCS', qty: 1, price: 10 }))), 'a bad date is refused');
ok(/only 5 held|only 0 held|selling/.test(throws(() => A({ type: 'sell', date: '2026-10-03', symbol: 'TCS', qty: 15, price: 1 }))), 'a back-dated sell that would leave the book short is refused');
ok(/more than the cash/.test(throws(() => A({ type: 'withdraw', date: '2026-10-10', amount: 1e9 }))), 'a withdrawal above the cash is refused');
// paise never drift
const l2 = M.emptyLab(); l2.accounts.push({ id: 'b', name: 'b', fees: {} });
M.addTxn(l2, { acct: 'b', type: 'deposit', date: '2026-01-01', amount: 1000 });
for (let i = 0; i < 30; i++) M.addTxn(l2, { acct: 'b', type: 'buy', date: '2026-01-02', symbol: 'X', qty: 1, price: 0.1 + 0 * i, fees: 0.01 });
ok(M.replay(l2.txns).cash === 1000 - 30 * 0.11 && M.replay(l2.txns).cash === 996.7, 'thirty small orders add up to the exact paisa (996.70)');
// valuation
const rpv = M.replay(lab.txns, { today: '2026-10-10' });
const v = M.valueAccount(rpv, (s) => (s === 'TCS' ? { price: 4400, prevClose: 4300 } : null), () => null);
ok(v.holdingsValue === 66000 && v.unrealized === 66000 - 61650, 'value and unrealised profit of the open position');
ok(v.value === rp.cash + 66000 && v.pnl === v.value - 100000, 'account value is cash plus holdings; profit is against capital put in');
ok(Math.abs(v.ret - v.pnl / 100000) < 1e-12 && v.day === 15 * 100, 'return % and today’s change (15 shares up 100)');
const none = M.valueAccount(rpv, () => null, () => null);
ok(none.holdingsValue === 61650 && none.unpriced === 1 && none.holdings[0].noPrice, 'a holding with no price is carried at cost and flagged, never shown as a loss');
// bought today: today's change is from the buy price
const l3 = M.emptyLab(); l3.accounts.push({ id: 'c', name: 'c', fees: {} });
M.addTxn(l3, { acct: 'c', type: 'deposit', date: '2026-10-10', amount: 10000 });
M.addTxn(l3, { acct: 'c', type: 'buy', date: '2026-10-10', symbol: 'Z', qty: 10, price: 100 });
const v3 = M.valueAccount(M.replay(l3.txns, { today: '2026-10-10' }), () => ({ price: 105, prevClose: 90 }), () => null);
ok(v3.day === 50, 'shares bought today move from the price you paid, not yesterday’s close');
// baskets
const q = (s) => ({ A: { price: 300 }, B: { price: 77 }, C: { price: 1250 } }[s] || null);
const items = [{ symbol: 'A', weight: 50 }, { symbol: 'B', weight: 30 }, { symbol: 'C', weight: 20 }];
const plan = M.basketPlan(items, 100000, q, { flat: 20 });
ok(plan.ok && plan.orders.map((o) => o.qty).join() === '166,389,15', 'basket quantities are whole shares that fit each line after charges');
ok(plan.orders.every((o) => o.total <= o.alloc) && plan.spend + plan.leftover === 100000, 'no line goes over its share and leftover is exact');
ok(!M.basketPlan([{ symbol: 'A', weight: 60 }, { symbol: 'B', weight: 30 }], 1000, q, {}).ok, 'weights not totalling 100% block the basket');
ok(M.basketPlan([{ symbol: 'A', weight: 50 }, { symbol: 'Q', weight: 50 }], 1000, q, {}).problems.some((p) => /No price for Q/.test(p)), 'a missing price is reported');
// basket performance
const l4 = M.emptyLab(); l4.accounts.push({ id: 'd', name: 'd', fees: {} });
M.addTxn(l4, { acct: 'd', type: 'deposit', date: '2026-10-01', amount: 100000 });
for (const o of plan.orders) M.addTxn(l4, { acct: 'd', type: 'buy', date: '2026-10-02', symbol: o.symbol, qty: o.qty, price: o.price, fees: o.fees, basket: 'bk1', batch: 'x' });
const bs = M.basketStats(l4, 'bk1', (s) => ({ A: { price: 330 }, B: { price: 77 }, C: { price: 1250 } }[s]));
ok(bs.invested === plan.spend && bs.value === 166 * 330 + 389 * 77 + 15 * 1250 && bs.pnl === bs.value - bs.invested, 'basket profit = value now + sale proceeds − amount spent');
// options
const l5 = M.emptyLab(); l5.accounts.push({ id: 'e', name: 'e', fees: {} });
M.addTxn(l5, { acct: 'e', type: 'deposit', date: '2026-10-01', amount: 50000 });
const opt = { underlying: 'nifty', kind: 'call', strike: 25000, expiry: '2026-11-25', lot: 75 };
ok(/multiple of the lot/.test(throws(() => M.addTxn(l5, { acct: 'e', type: 'obuy', date: '2026-10-02', qty: 100, price: 100, opt }))), 'option quantity must be whole lots');
ok(/already expired/.test(throws(() => M.addTxn(l5, { acct: 'e', type: 'obuy', date: '2026-11-26', qty: 75, price: 1, opt }))), 'an expired option cannot be bought');
M.addTxn(l5, { acct: 'e', type: 'obuy', date: '2026-10-02', qty: 150, price: 100, fees: 40, opt });
let r5 = M.replay(l5.txns);
ok(r5.cash === 50000 - 15000 - 40 && r5.options.length === 1 && r5.options[0].key === 'NIFTY|call|25000|2026-11-25', 'buying an option takes premium x quantity plus charges');
M.addTxn(l5, { acct: 'e', type: 'osell', date: '2026-10-20', qty: 75, price: 160, opt });
r5 = M.replay(l5.txns);
ok(r5.realizedOpt === 75 * 160 - (15040 / 2) && r5.options[0].qty === 75, 'closing half an option position realises half the cost');
ok(/on or after its expiry/.test(throws(() => M.addTxn(l5, { acct: 'e', type: 'oexp', date: '2026-11-24', qty: 75, price: 0, opt }))), 'an option cannot be settled before its expiry');
M.addTxn(l5, { acct: 'e', type: 'oexp', date: '2026-11-25', qty: 75, price: 0, opt });
r5 = M.replay(l5.txns);
ok(r5.options.length === 0 && Math.abs(r5.realizedOpt - (75 * 160 - 15040 / 2 - 15040 / 2)) < 1e-9, 'an option that expires worthless loses the rest of its premium');
console.log(bad ? bad + ' failed' : 'all passed'); process.exit(bad ? 1 : 0);
