// Trading Lab: accounting model. Pure functions, no DOM, no link to the real portfolio.
//
// Everything is a ledger. An account's cash, holdings, realised profit and charges are always recalculated from its
// transactions (`replay`), so they cannot drift apart. Money is added up in whole paise (integers).
//
// Lab data lives under the optional key `lab` of the data file (nothing else in the file reads it):
//   lab = { v: 1, accounts: [], txns: [], watchlists: [], baskets: [], marks: [], snaps: [], settings: {} }
//   account   { id, name, capital, createdAt, archived, fees: { brokeragePct, flat, otherPct } }
//   txn       { id, acct, date, ts, type, symbol, name, yahoo, qty, price, amount, fees, note, basket, batch, opt }
//             type: deposit | withdraw | buy | sell | obuy | osell | oexp
//   opt       { underlying, yahoo, kind: 'call' | 'put', strike, expiry, lot }   (options are bought to open, sold to close)
//
// Average-cost method. Buy charges are added to the cost; sell charges come off the proceeds.

export const r2 = (x) => Math.round((Number(x) + Number.EPSILON) * 100) / 100;
export const toP = (x) => Math.round((Number(x) + Number.EPSILON) * 100);   // rupees to paise
const fromP = (p) => p / 100;

export const TYPES = ['deposit', 'withdraw', 'buy', 'sell', 'obuy', 'osell', 'oexp'];
export const isOpt = (t) => t === 'obuy' || t === 'osell' || t === 'oexp';
export const optKey = (o) => `${String(o.underlying).toUpperCase()}|${o.kind}|${Number(o.strike)}|${o.expiry}`;
export const emptyLab = () => ({ v: 1, accounts: [], txns: [], watchlists: [], baskets: [], marks: [], snaps: [], settings: { iv: 0.2, rate: 0.07 } });
let lastTs = 0;
/** An ISO timestamp that always moves forward, so orders on the same day keep the order they were entered. */
export const nowTs = () => { lastTs = Math.max(lastTs + 1, Date.now()); return new Date(lastTs).toISOString(); };
export const newId = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** Charges for an order of `value` rupees under an account's settings, in rupees rounded to the paisa. */
export function feeFor(fees, value) {
  const f = fees || {};
  return fromP(toP(((Number(f.brokeragePct) || 0) / 100) * value + ((Number(f.otherPct) || 0) / 100) * value + (Number(f.flat) || 0)));
}
/** Gross value of an order line in paise. */
export const grossP = (t) => toP(Number(t.qty) * Number(t.price));
// Same day: money coming in (deposits) is played first, so a deposit added later but dated the same day still funds that day's buys.
// After that, equal date and time keep the order they were added.
const rank = (t) => (t.type === 'deposit' ? 0 : 1);
const cmp = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : rank(a) - rank(b) || ((a.ts || '') < (b.ts || '') ? -1 : (a.ts || '') > (b.ts || '') ? 1 : 0));
export const sortTxns = (txns) => txns.slice().sort(cmp);

/**
 * Plays an account's transactions in date order.
 * Returns { cash, deposited, holdings, options, realized, realizedStock, realizedOpt, fees, rows, errors }.
 * `rows` are the transactions with `realized` (for sells and expiries) and `cashAfter`.
 * Errors name the first transaction that would take cash or a holding below zero.
 */
export function replay(txns, { today = '' } = {}) {
  let cash = 0, dep = 0, feesP = 0, realS = 0, realO = 0;
  const pos = new Map(), opt = new Map(), rows = [], errors = [];
  const touch = (m, key, base) => { if (!m.has(key)) m.set(key, { ...base, qty: 0, costP: 0, qtyToday: 0, costTodayP: 0 }); return m.get(key); };
  for (const t of sortTxns(txns)) {
    const fp = toP(t.fees || 0), row = { ...t };
    if (t.type === 'deposit') { cash += toP(t.amount); dep += toP(t.amount); }
    else if (t.type === 'withdraw') { cash -= toP(t.amount); dep -= toP(t.amount); if (cash < 0) errors.push(`${t.date}: withdrawal is more than the cash in the account`); }
    else if (t.type === 'buy' || t.type === 'obuy') {
      const isO = t.type === 'obuy', g = grossP(t), p = touch(isO ? opt : pos, isO ? optKey(t.opt) : String(t.symbol).toUpperCase(), isO ? { key: optKey(t.opt), ...t.opt, name: t.name } : { symbol: String(t.symbol).toUpperCase(), name: t.name, yahoo: t.yahoo });
      cash -= g + fp; feesP += fp; p.qty += Number(t.qty); p.costP += g + fp;
      if (t.date === today) { p.qtyToday += Number(t.qty); p.costTodayP += g; }
      if (cash < 0) {
        const have = fromP(cash + g + fp), later = txns.filter((d) => d.type === 'deposit' && d.date > t.date).sort((a, b) => (a.date < b.date ? -1 : 1))[0];
        errors.push(`${t.date}: not enough cash for ${t.symbol || t.name}: it needs ₹${fromP(g + fp).toFixed(2)} but the account had ₹${Math.max(0, have).toFixed(2)} on that date.`
          + (later ? ` Money was added only from ${later.date}. Move the account's start date back to ${t.date} (or earlier) to trade on that day.` : ''));
      }
    } else if (t.type === 'sell' || t.type === 'osell' || t.type === 'oexp') {
      const isO = t.type !== 'sell', key = isO ? optKey(t.opt) : String(t.symbol).toUpperCase(), m = isO ? opt : pos, p = m.get(key), q = Number(t.qty);
      if (!p || p.qty < q - 1e-9) { errors.push(`${t.date}: selling ${q} of ${t.symbol || t.name} but only ${p ? p.qty : 0} held`); rows.push(row); continue; }
      const g = grossP(t), cogs = p.qty === q ? p.costP : Math.round((p.costP * q) / p.qty), proceeds = g - fp, gain = proceeds - cogs;
      cash += proceeds; feesP += fp; p.qty -= q; p.costP -= cogs; p.qtyToday = Math.max(0, Math.min(p.qtyToday, p.qty)); if (p.qty === 0) { p.costP = 0; p.costTodayP = 0; }
      row.realized = fromP(gain); if (isO) realO += gain; else realS += gain;
    }
    row.cashAfter = fromP(cash); rows.push(row);
  }
  const done = (m) => [...m.values()].filter((p) => p.qty > 1e-9).map((p) => ({ ...p, cost: fromP(p.costP), avg: p.qty ? fromP(p.costP) / p.qty : 0, costToday: fromP(p.costTodayP) }));
  return { cash: fromP(cash), deposited: fromP(dep), holdings: done(pos), options: done(opt), realized: fromP(realS + realO), realizedStock: fromP(realS), realizedOpt: fromP(realO), fees: fromP(feesP), rows, errors };
}

/** Adds a transaction if the whole ledger still plays through; otherwise throws with the reason. Returns the stored transaction. */
export function addTxn(lab, input) {
  const acct = lab.accounts.find((a) => a.id === input.acct);
  if (!acct) throw new Error('Choose a trading account.');
  if (acct.archived) throw new Error('This account is archived. Restore it to trade.');
  const t = normalise(input);
  const candidate = lab.txns.filter((x) => x.acct === acct.id).concat([t]);
  const rp = replay(candidate);
  if (rp.errors.length) throw new Error(rp.errors[0]);
  lab.txns.push(t);
  return t;
}
/** Checks and rounds an order or cash movement; throws a plain message when something is wrong. */
export function normalise(i) {
  if (!TYPES.includes(i.type)) throw new Error('Unknown transaction type.');
  if (!/^\d{4}-\d\d-\d\d$/.test(i.date || '')) throw new Error('Enter a valid date.');
  const t = { id: i.id || newId('lt'), acct: i.acct, date: i.date, ts: i.ts || nowTs(), type: i.type, note: String(i.note || '').trim().slice(0, 200) };
  if (i.type === 'deposit' || i.type === 'withdraw') {
    const a = Number(i.amount); if (!(a > 0)) throw new Error('Enter an amount above zero.');
    return { ...t, amount: r2(a), fees: 0 };
  }
  const q = Number(i.qty), p = Number(i.price);
  if (!(q > 0)) throw new Error('Quantity must be above zero.');
  if (i.type === 'oexp' ? !(p >= 0) : !(p > 0)) throw new Error(i.type === 'oexp' ? 'Settlement price cannot be negative.' : 'Price must be above zero.');
  const fees = i.fees == null || i.fees === '' ? 0 : Number(i.fees);
  if (!(fees >= 0)) throw new Error('Charges cannot be negative.');
  const o = { ...t, qty: q, price: r2(p) === p ? p : Math.round(p * 10000) / 10000, amount: r2(q * p), fees: r2(fees) };
  if (i.basket) o.basket = i.basket; if (i.batch) o.batch = i.batch;
  if (isOpt(i.type)) {
    const op = i.opt || {};
    if (!op.underlying) throw new Error('Enter the underlying (for example NIFTY or RELIANCE).');
    if (op.kind !== 'call' && op.kind !== 'put') throw new Error('Choose call or put.');
    if (!(Number(op.strike) > 0)) throw new Error('Enter the strike price.');
    if (!/^\d{4}-\d\d-\d\d$/.test(op.expiry || '')) throw new Error('Enter the expiry date.');
    if (!(Number(op.lot) >= 1)) throw new Error('Enter the lot size.');
    if (i.type !== 'oexp' && i.date > op.expiry) throw new Error('This option has already expired on ' + op.expiry + ', so it cannot be traded.');
    if (i.type === 'oexp' && i.date < op.expiry) throw new Error('An option can only be settled on or after its expiry date (' + op.expiry + ').');
    if (i.type !== 'oexp' && Math.round(q) % Number(op.lot) !== 0) throw new Error(`Quantity must be a multiple of the lot size (${op.lot}).`);
    o.opt = { underlying: String(op.underlying).toUpperCase(), yahoo: op.yahoo || '', kind: op.kind, strike: Number(op.strike), expiry: op.expiry, lot: Number(op.lot) };
    o.name = i.name || `${o.opt.underlying} ${o.opt.strike} ${o.opt.kind === 'call' ? 'CE' : 'PE'}`; o.symbol = o.opt.underlying;
  } else {
    if (!i.symbol) throw new Error('Choose a share.');
    if (Math.round(q) !== q) throw new Error('Shares must be a whole number.');
    o.symbol = String(i.symbol).toUpperCase(); o.name = i.name || o.symbol; o.yahoo = i.yahoo || '';
  }
  return o;
}

/** Cash in an account at the end of `date` (all transactions dated on or before it). */
export const cashOn = (txns, date) => replay(txns.filter((t) => t.date <= date)).cash;
/** The date money first reached the account (its earliest deposit), or '' when nothing was ever deposited. */
export const startDate = (txns) => txns.filter((t) => t.type === 'deposit').map((t) => t.date).sort()[0] || '';
/**
 * Moves the account's starting capital (its earliest deposit) to `date`, so trades can be dated from then.
 * Moving earlier only ever adds cash sooner, so the ledger still plays through; moving later is checked like any other change.
 */
export function moveStart(lab, acctId, date) {
  if (!/^\d{4}-\d\d-\d\d$/.test(date || '')) throw new Error('Enter a valid date.');
  const mine = lab.txns.filter((t) => t.acct === acctId), first = mine.filter((t) => t.type === 'deposit').sort(cmp)[0];
  if (!first) throw new Error('This account has no starting capital to move.');
  const before = first.date; first.date = date;
  const rp = replay(mine);
  if (rp.errors.length) { first.date = before; throw new Error('Cannot move the start date: ' + rp.errors[0]); }
  return first;
}

/** Cash needed for / received from an order: { gross, fees, total } where total is what leaves (buy) or arrives (sell). */
export function orderPreview(side, qty, price, fees) {
  const gross = r2(qty * price), f = r2(fees || 0);
  return { gross, fees: f, total: side === 'buy' ? r2(gross + f) : r2(gross - f) };
}

/**
 * Values an account from its replay, using last prices.
 * `quote(symbol) -> { price, prevClose } | null`, `optionPrice(position) -> { premium, source } | null`.
 * A holding with no price is carried at cost and flagged, so a missing quote never shows as a loss.
 */
export function valueAccount(rp, quote, optionPrice, account) {
  let mv = 0, costOpen = 0, day = 0, unpriced = 0;
  const holdings = rp.holdings.map((p) => {
    const q = quote(p.symbol), price = q && q.price > 0 ? q.price : null;
    const value = price == null ? p.cost : r2(p.qty * price);
    const dayPnl = price == null || !q || !(q.prevClose > 0) ? 0 : (p.qty - p.qtyToday) * (price - q.prevClose) + (p.qtyToday ? p.qtyToday * price - p.costToday : 0);
    if (price == null) unpriced++;
    mv += value; costOpen += p.cost; day += dayPnl;
    return { ...p, price, prevClose: q ? q.prevClose || null : null, value, pnl: value - p.cost, ret: p.cost ? (value - p.cost) / p.cost : 0, dayPnl, noPrice: price == null };
  });
  let omv = 0, ocost = 0;
  const options = rp.options.map((p) => {
    const o = optionPrice(p), value = o && o.premium != null ? r2(p.qty * o.premium) : p.cost;
    if (!o || o.premium == null) unpriced++;
    omv += value; ocost += p.cost;
    return { ...p, premium: o ? o.premium : null, source: o ? o.source : null, value, pnl: value - p.cost, ret: p.cost ? (value - p.cost) / p.cost : 0, noPrice: !o || o.premium == null };
  });
  const value = r2(rp.cash + mv + omv), pnl = r2(value - rp.deposited);
  return { cash: rp.cash, holdingsValue: r2(mv), optionsValue: r2(omv), value, deposited: rp.deposited, pnl, ret: rp.deposited > 0 ? pnl / rp.deposited : 0, unrealized: r2(mv - costOpen + omv - ocost), realized: rp.realized, day: r2(day), fees: rp.fees, positions: holdings.length + options.length, holdings, options, unpriced };
}

/** Plan for investing `amount` in a basket: whole shares per line, charges included, never above the amount. */
export function basketPlan(items, amount, quote, fees) {
  const total = items.reduce((a, i) => a + Number(i.weight || 0), 0);
  const problems = [];
  if (!items.length) problems.push('Add at least one share to the basket.');
  if (Math.abs(total - 100) > 0.005) problems.push(`Weights add up to ${r2(total)}%, not 100%.`);
  if (!(amount > 0)) problems.push('Enter the amount to invest.');
  const orders = items.map((i) => {
    const q = quote(i.symbol), price = q && q.price > 0 ? q.price : null, alloc = r2((amount * Number(i.weight || 0)) / 100);
    if (price == null) { problems.push(`No price for ${i.symbol}. Refresh prices first.`); return { ...i, price: null, alloc, qty: 0, gross: 0, fees: 0, total: 0 }; }
    let qty = Math.floor(alloc / price);
    while (qty > 0 && r2(qty * price) + feeFor(fees, qty * price) > alloc + 1e-9) qty--;
    const gross = r2(qty * price), f = qty ? feeFor(fees, gross) : 0;
    return { ...i, price, alloc, qty, gross, fees: f, total: r2(gross + f) };
  });
  const spend = r2(orders.reduce((a, o) => a + o.total, 0));
  return { orders, spend, leftover: r2(amount - spend), weight: r2(total), problems, ok: !problems.length && orders.some((o) => o.qty > 0) };
}

/** How a basket has done, from the transactions placed through it (any account). */
export function basketStats(lab, basketId, quote) {
  const ts = lab.txns.filter((t) => t.basket === basketId);
  const held = new Map(); let spent = 0, back = 0;
  for (const t of ts) {
    const g = grossP(t), f = toP(t.fees || 0), k = t.symbol;
    if (t.type === 'buy') { spent += g + f; held.set(k, (held.get(k) || 0) + Number(t.qty)); }
    else if (t.type === 'sell') { back += g - f; held.set(k, (held.get(k) || 0) - Number(t.qty)); }
  }
  let value = 0, unpriced = 0;
  for (const [k, q] of held) { if (q <= 0) continue; const x = quote(k); if (x && x.price > 0) value += toP(q * x.price); else unpriced++; }
  const pnl = value + back - spent;
  return { invested: fromP(spent), value: fromP(value), proceeds: fromP(back), pnl: fromP(pnl), ret: spent ? pnl / spent : 0, open: [...held.values()].some((q) => q > 0), unpriced, orders: ts.length };
}
