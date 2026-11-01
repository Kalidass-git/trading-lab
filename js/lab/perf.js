// Trading Lab: performance measures. Pure functions (no DOM, no network): XIRR, trade statistics, a rebuilt equity curve,
// a "same money in the index" comparison and plain-language findings about how a strategy has worked.
import { replay, sortTxns, grossP, optKey, isOpt, r2 } from './model.js';

const DAY = 864e5;
const dayNo = (date) => Math.round(Date.parse(date + 'T00:00:00Z') / DAY);
export const daysBetween = (a, b) => dayNo(b) - dayNo(a);

/**
 * Annualised rate of return for dated cash flows [{ date, amount }] (money you put in is negative, money you get back is positive,
 * and what you still hold counts as a positive flow today). Returns a fraction (0.12 = 12% a year) or null when it cannot be worked out.
 */
export function xirr(flows) {
  const f = flows.filter((x) => Number.isFinite(x.amount) && x.amount !== 0).map((x) => ({ t: dayNo(x.date), a: x.amount }));
  if (f.length < 2 || !f.some((x) => x.a < 0) || !f.some((x) => x.a > 0)) return null;
  const t0 = Math.min(...f.map((x) => x.t));
  if (Math.max(...f.map((x) => x.t)) - t0 < 30) return null;   // annualising under a month of history gives meaningless numbers (a 1% gain in a day is millions of % a year)
  const npv = (r) => f.reduce((s, x) => s + x.a / Math.pow(1 + r, (x.t - t0) / 365), 0);
  let lo = -0.999999, hi = 1e6, flo = npv(lo);
  const fhi = npv(hi);
  if (!Number.isFinite(flo) || !Number.isFinite(fhi) || flo * fhi > 0) return null;   // no rate in range makes the flows add up to zero
  for (let i = 0; i < 300; i++) {                       // bisection: robust, needs no starting guess
    const mid = (lo + hi) / 2, fm = npv(mid);
    if (Math.abs(fm) < 1e-7 || (hi - lo) < 1e-12) return mid;
    if (flo * fm < 0) hi = mid; else { lo = mid; flo = fm; }
  }
  return (lo + hi) / 2;
}

/** Money that crossed the account boundary: deposits are outflows from you, withdrawals are inflows. */
export function externalFlows(txns) {
  return sortTxns(txns).filter((t) => t.type === 'deposit' || t.type === 'withdraw').map((t) => ({ date: t.date, amount: t.type === 'deposit' ? -Number(t.amount) : Number(t.amount) }));
}
/** XIRR of an account (or several) from its deposits and withdrawals plus today's value. */
export function portfolioXirr(txns, value, today) {
  const flows = externalFlows(txns);
  if (!flows.length) return null;
  return xirr([...flows, { date: today, amount: value }]);
}
/** Orders of one kind as flows: buys out, sells and expiries in. `pick(t)` chooses the orders to include. */
export function orderFlows(txns, pick) {
  const out = [];
  for (const t of sortTxns(txns)) {
    if (!pick(t)) continue;
    const g = grossP(t) / 100, f = Number(t.fees || 0);
    if (t.type === 'buy' || t.type === 'obuy') out.push({ date: t.date, amount: -(g + f) });
    else if (t.type === 'sell' || t.type === 'osell' || t.type === 'oexp') out.push({ date: t.date, amount: g - f });
  }
  return out;
}
/** XIRR of one share: its buys and sells plus what is still held at today's value. */
export function symbolXirr(txns, symbol, openValue, today) {
  const sym = String(symbol).toUpperCase();
  const fl = orderFlows(txns, (t) => (t.type === 'buy' || t.type === 'sell') && String(t.symbol).toUpperCase() === sym);
  return xirr(openValue > 0 ? [...fl, { date: today, amount: openValue }] : fl);
}
/** XIRR of a group of orders (a strategy), with the value still open at today's price. */
export function groupXirr(txns, pick, openValue, today) {
  const fl = orderFlows(txns, pick);
  return xirr(openValue > 0 ? [...fl, { date: today, amount: openValue }] : fl);
}
/** Days from the first transaction to today. */
export function historyDays(txns, today) {
  const d = txns.map((t) => t.date).sort()[0];
  return d ? Math.max(0, daysBetween(d, today)) : 0;
}

/**
 * Every closed trade (a sell, an option sale or an expiry) with its profit, return and how long the shares were held
 * (from the quantity-weighted average buy date). `txnsByAcct` is a list of ledgers, one per account.
 */
export function closedTrades(ledgers) {
  const out = [];
  for (const txns of ledgers) {
    const rp = replay(txns), gain = new Map(rp.rows.filter((r) => r.realized != null).map((r) => [r.id, r.realized]));
    const pos = new Map();
    for (const t of sortTxns(txns)) {
      if (t.type === 'deposit' || t.type === 'withdraw') continue;
      const opt = isOpt(t.type), key = opt ? optKey(t.opt) : String(t.symbol).toUpperCase(), p = pos.get(key) || { qty: 0, w: 0 }, q = Number(t.qty), d = dayNo(t.date);
      if (t.type === 'buy' || t.type === 'obuy') { p.qty += q; p.w += q * d; pos.set(key, p); continue; }
      if (!p.qty || !gain.has(t.id)) continue;
      const avg = p.w / p.qty, held = Math.max(0, d - avg), g = gain.get(t.id), proceeds = grossP(t) / 100 - Number(t.fees || 0), cogs = proceeds - g;
      p.w -= avg * q; p.qty -= q; if (p.qty <= 1e-9) { p.qty = 0; p.w = 0; }
      out.push({ id: t.id, acct: t.acct, date: t.date, symbol: opt ? t.opt.underlying : String(t.symbol).toUpperCase(), name: t.name || t.symbol, kind: opt ? 'Options' : t.basket ? 'Baskets' : 'Stocks', gain: g, ret: cogs > 0 ? g / cogs : 0, held, qty: q });
    }
  }
  return out;
}

/** Win rate, average win and loss, payoff, profit factor, expectancy and holding periods for a list of closed trades. */
export function tradeStats(closed) {
  const wins = closed.filter((c) => c.gain > 0.005), losses = closed.filter((c) => c.gain < -0.005), flat = closed.length - wins.length - losses.length;
  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0), avg = (a, f) => (a.length ? sum(a, f) / a.length : 0);
  const gw = sum(wins, (c) => c.gain), gl = -sum(losses, (c) => c.gain), n = closed.length;
  const best = closed.slice().sort((a, b) => b.gain - a.gain)[0] || null, worst = closed.slice().sort((a, b) => a.gain - b.gain)[0] || null;
  return {
    n, wins: wins.length, losses: losses.length, flat, winRate: n ? wins.length / n : 0,
    avgWin: avg(wins, (c) => c.gain), avgLoss: avg(losses, (c) => -c.gain), avgWinPct: avg(wins, (c) => c.ret), avgLossPct: avg(losses, (c) => c.ret),
    payoff: losses.length && wins.length ? avg(wins, (c) => c.gain) / avg(losses, (c) => -c.gain) : null,
    profitFactor: gl > 0 ? gw / gl : gw > 0 ? Infinity : null, expectancy: n ? sum(closed, (c) => c.gain) / n : 0, total: sum(closed, (c) => c.gain),
    holdWin: wins.length ? avg(wins, (c) => c.held) : null, holdLoss: losses.length ? avg(losses, (c) => c.held) : null, holdAll: n ? avg(closed, (c) => c.held) : null, best, worst,
  };
}
/** Realised profit by calendar month, oldest first: [{ month: '2026-10', gain, trades }]. */
export function monthlyRealised(closed) {
  const m = new Map();
  for (const c of closed) { const k = c.date.slice(0, 7), x = m.get(k) || { month: k, gain: 0, trades: 0 }; x.gain += c.gain; x.trades++; m.set(k, x); }
  return [...m.values()].sort((a, b) => (a.month < b.month ? -1 : 1)).map((x) => ({ ...x, gain: r2(x.gain) }));
}
/** Realised profit by share (largest contributors first). */
export function bySymbol(closed) {
  const m = new Map();
  for (const c of closed) { const x = m.get(c.symbol) || { symbol: c.symbol, gain: 0, trades: 0, wins: 0 }; x.gain += c.gain; x.trades++; if (c.gain > 0.005) x.wins++; m.set(c.symbol, x); }
  return [...m.values()].map((x) => ({ ...x, gain: r2(x.gain) })).sort((a, b) => b.gain - a.gain);
}

/**
 * Daily value of the account(s), rebuilt from the orders and the share price history that has been loaded.
 * `closeOn(symbol, date)` returns the last known close on or before the date, or null. When a share has no history the last traded price is used and
 * the curve is marked `approx`. Options are carried at cost. `quote(symbol)` gives today's price. Returns { points, approx, missing }.
 */
export function equityCurve(ledgers, closeOn, quote, today) {
  const all = ledgers.flat();
  if (!all.length) return { points: [], approx: false, missing: [] };
  const start = all.map((t) => t.date).sort()[0];
  const dates = new Set([start, today]); for (const t of all) dates.add(t.date);
  const syms = new Set(all.filter((t) => t.type === 'buy' || t.type === 'sell').map((t) => String(t.symbol).toUpperCase()));
  const missing = []; let approx = false;
  for (const s of syms) { const probe = closeOn(s, today); if (probe == null) { missing.push(s); approx = true; } }
  // dates: every day with a transaction, plus weekdays between (so the curve is smooth when history exists)
  for (let d = dayNo(start); d <= dayNo(today); d++) { const w = new Date(d * DAY).getUTCDay(); if (w >= 1 && w <= 5) dates.add(new Date(d * DAY).toISOString().slice(0, 10)); }
  const order = [...dates].filter((d) => d >= start && d <= today).sort();
  const txs = ledgers.map((l) => sortTxns(l)), idx = txs.map(() => 0), state = txs.map(() => ({ cash: 0, dep: 0, pos: new Map(), last: new Map() }));
  const points = [];
  for (const d of order) {
    let value = 0, dep = 0;
    txs.forEach((l, i) => {
      const s = state[i];
      while (idx[i] < l.length && l[idx[i]].date <= d) {
        const t = l[idx[i]++], g = grossP(t) / 100, f = Number(t.fees || 0);
        if (t.type === 'deposit') { s.cash += Number(t.amount); s.dep += Number(t.amount); }
        else if (t.type === 'withdraw') { s.cash -= Number(t.amount); s.dep -= Number(t.amount); }
        else {
          const key = isOpt(t.type) ? 'o:' + optKey(t.opt) : String(t.symbol).toUpperCase(), p = s.pos.get(key) || { qty: 0, cost: 0, opt: isOpt(t.type) };
          if (t.type === 'buy' || t.type === 'obuy') { s.cash -= g + f; p.qty += Number(t.qty); p.cost += g + f; s.last.set(key, Number(t.price)); }
          else { const q = Number(t.qty), part = p.qty ? (p.cost * q) / p.qty : 0; s.cash += g - f; p.qty -= q; p.cost -= part; s.last.set(key, Number(t.price)); }
          s.pos.set(key, p);
        }
      }
      value += s.cash; dep += s.dep;
      for (const [key, p] of s.pos) {
        if (p.qty <= 1e-9) continue;
        if (p.opt) { value += p.cost; continue; }
        let px = d === today ? (quote(key) && quote(key).price > 0 ? quote(key).price : null) : null;
        if (px == null) px = closeOn(key, d);
        if (px == null) px = s.last.get(key);
        value += p.qty * px;
      }
    });
    points.push({ date: d, value: r2(value), deposited: r2(dep), pnl: r2(value - dep) });
  }
  return { points, approx, missing };
}
/** Time-weighted return and the worst fall from a peak, from an equity curve (cash put in or taken out does not count as profit). */
export function curveStats(points) {
  if (points.length < 2) return { twr: null, maxDrawdown: null, ddFrom: null, ddTo: null };
  let idx = 1, peak = 1, mdd = 0, from = points[0].date, ddFrom = null, ddTo = null, prev = points[0];
  for (let i = 1; i < points.length; i++) {
    const p = points[i], flow = p.deposited - prev.deposited, base = prev.value;
    if (base > 0) idx *= (p.value - flow) / base;
    if (idx > peak) { peak = idx; from = p.date; }
    const dd = peak > 0 ? idx / peak - 1 : 0;
    if (dd < mdd) { mdd = dd; ddFrom = from; ddTo = p.date; }
    prev = p;
  }
  return { twr: idx - 1, maxDrawdown: mdd, ddFrom, ddTo };
}

/**
 * What the same deposits and withdrawals would be worth if they had gone into an index instead (bought and sold at that day's close).
 * `closeOn(date)` is the index close on or before the date. Returns { value, pnl, xirr } or null when the index has no data for a flow.
 */
export function benchmark(txns, closeOn, today) {
  const flows = externalFlows(txns);
  if (!flows.length) return null;
  let units = 0;
  for (const f of flows) { const px = closeOn(f.date); if (!(px > 0)) return null; units += -f.amount / px; }
  const last = closeOn(today); if (!(last > 0)) return null;
  const value = units * last, net = -flows.reduce((s, f) => s + f.amount, 0);
  return { value: r2(value), pnl: r2(value - net), xirr: xirr([...flows, { date: today, amount: value }]) };
}

/**
 * The same money put into an index: for each point of an equity curve, what the deposits so far would be worth if each had bought the index
 * that day. Returns values aligned with `points` (null while the index has no price yet).
 */
export function benchmarkSeries(points, closeOn) {
  let units = 0, prev = 0; const out = [];
  for (const p of points) {
    const px = closeOn(p.date), flow = p.deposited - prev; prev = p.deposited;
    if (!(px > 0)) { out.push(null); continue; }
    units += flow / px; out.push(r2(units * px));
  }
  return out;
}

const pc = (x, d = 0) => (x * 100).toFixed(d) + '%';
const rs = (x) => '₹' + Math.round(Math.abs(x)).toLocaleString('en-IN');
/**
 * Plain-language findings. Each is { tone: 'good' | 'warn' | 'bad' | 'info', title, text }. They describe what the numbers show; with few
 * closed trades they say so, because a handful of trades proves little.
 * input = { stats, xirr, days, bench, totals, holdings: [{ symbol, value }], strategies: { Stocks, Baskets, Options }, cashPct, feesPct, curve }
 */
export function findings(i) {
  const out = [], s = i.stats;
  if (s.n === 0) out.push({ tone: 'info', title: 'Nothing sold yet', text: 'No trade has been closed, so there is no win rate or payoff to judge. Profit so far is on paper and will move with prices.' });
  else if (s.n < 10) out.push({ tone: 'info', title: 'Small sample', text: `Only ${s.n} closed trade${s.n === 1 ? '' : 's'} so far. Win rates and averages move a lot with so few; treat what follows as early signs, not conclusions.` });
  if (i.bench && i.bench.xirr != null && i.xirr != null) {
    const d = i.xirr - i.bench.xirr;
    out.push({ tone: d >= 0 ? 'good' : 'bad', title: d >= 0 ? 'Ahead of the index' : 'Behind the index',
      text: `Your money grew at ${pc(i.xirr, 1)} a year (XIRR). The same deposits in the index would have grown at ${pc(i.bench.xirr, 1)}, ${d >= 0 ? 'so you are ahead by' : 'so you are behind by'} ${pc(Math.abs(d), 1)} a year (${rs(i.totals.pnl - i.bench.pnl)} ${i.totals.pnl >= i.bench.pnl ? 'more' : 'less'} profit).` });
  } else if (i.xirr != null) out.push({ tone: i.xirr >= 0 ? 'good' : 'bad', title: 'Annualised return', text: `Your money is growing at ${pc(i.xirr, 1)} a year (XIRR). Load the index history to see whether that beats simply holding the index.` });
  if (i.days < 90 && i.xirr != null) out.push({ tone: 'info', title: 'Short history', text: `This account is ${i.days} days old. An annualised rate over such a short time can look extreme; read the plain return as well.` });
  if (s.n >= 3) {
    if (s.winRate >= 0.5 && s.payoff != null && s.payoff < 1) out.push({ tone: 'warn', title: 'You win often but lose bigger', text: `${pc(s.winRate)} of trades made money, but the average loss (${rs(s.avgLoss)}) is larger than the average win (${rs(s.avgWin)}). A few bad trades are cancelling many good ones: consider tighter exits on losers.` });
    else if (s.winRate < 0.5 && s.payoff != null && s.payoff >= 1.5) out.push({ tone: 'good', title: 'Few wins, but big ones', text: `Only ${pc(s.winRate)} of trades won, but the average win (${rs(s.avgWin)}) is ${s.payoff.toFixed(1)}× the average loss (${rs(s.avgLoss)}). That works as long as you keep letting winners run.` });
    else if (s.winRate >= 0.5 && s.payoff != null) out.push({ tone: 'good', title: 'Healthy mix of wins and losses', text: `${pc(s.winRate)} winners, and wins average ${s.payoff.toFixed(1)}× the size of losses.` });
    else if (s.winRate < 0.5 && s.payoff != null) out.push({ tone: 'bad', title: 'Losing more often and by more', text: `${pc(s.winRate)} of trades won and wins are only ${s.payoff.toFixed(1)}× the losses. Neither side of the strategy is paying yet.` });
    if (s.profitFactor != null && Number.isFinite(s.profitFactor)) out.push({ tone: s.profitFactor >= 1.5 ? 'good' : s.profitFactor >= 1 ? 'info' : 'bad', title: `Profit factor ${s.profitFactor.toFixed(2)}`, text: s.profitFactor >= 1 ? `Every ₹1 lost on closed trades was matched by ₹${s.profitFactor.toFixed(2)} won.` : `Closed trades lost more than they won (₹${s.profitFactor.toFixed(2)} won for every ₹1 lost).` });
  }
  if (s.holdWin != null && s.holdLoss != null && s.wins >= 2 && s.losses >= 2) {
    if (s.holdLoss > s.holdWin * 1.3) out.push({ tone: 'warn', title: 'Losers are held longer than winners', text: `Winners were sold after ${Math.round(s.holdWin)} days on average, losers after ${Math.round(s.holdLoss)}. Holding losers and selling winners early is a common habit that hurts results.` });
    else if (s.holdWin > s.holdLoss * 1.3) out.push({ tone: 'good', title: 'You let winners run', text: `Winners were held ${Math.round(s.holdWin)} days against ${Math.round(s.holdLoss)} for losers, which is the pattern that usually pays.` });
  }
  const top = (i.holdings || []).slice().sort((a, b) => b.value - a.value)[0], tv = (i.holdings || []).reduce((a, h) => a + h.value, 0);
  if (top && tv > 0 && top.value / tv > 0.35 && i.holdings.length > 1) out.push({ tone: 'warn', title: 'One share dominates', text: `${top.symbol} is ${pc(top.value / tv)} of your holdings. A bad day for it hits the whole account.` });
  if (i.cashPct != null && i.cashPct > 0.4) out.push({ tone: 'info', title: 'A lot of idle cash', text: `${pc(i.cashPct)} of the account is cash. That limits both risk and return.` });
  if (i.feesPct != null && i.feesPct > 0.15 && s.total > 0) out.push({ tone: 'warn', title: 'Charges eat into profit', text: `Charges are ${pc(i.feesPct)} of the profit made so far. Fewer, larger trades would keep more of it.` });
  const st = i.strategies || {}, ks = Object.keys(st).filter((k) => st[k].orders > 0);
  if (ks.length > 1) { const best = ks.slice().sort((a, b) => st[b].ret - st[a].ret)[0], worst = ks.slice().sort((a, b) => st[a].ret - st[b].ret)[0]; if (best !== worst) out.push({ tone: 'info', title: `${best} are doing best`, text: `${best} are ${st[best].ret >= 0 ? 'up' : 'down'} ${pc(Math.abs(st[best].ret), 1)} on the money spent, ${worst} ${st[worst].ret >= 0 ? 'up' : 'down'} ${pc(Math.abs(st[worst].ret), 1)}.` }); }
  if (i.curve && i.curve.maxDrawdown != null && i.curve.maxDrawdown < -0.1) out.push({ tone: 'warn', title: `Worst fall ${pc(Math.abs(i.curve.maxDrawdown), 1)}`, text: `From ${i.curve.ddFrom} to ${i.curve.ddTo} the account fell by ${pc(Math.abs(i.curve.maxDrawdown), 1)} from its peak. Ask whether you could have sat through that with real money.` });
  return out;
}
