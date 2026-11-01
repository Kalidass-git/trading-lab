// Trading Lab: Insights. Did the strategy work? XIRR against the index, win rate and payoff, strategy by strategy, a rebuilt equity curve and
// plain-language findings. Index and share history load only when the buttons here are pressed.
import * as BK from '../lab/book.js';
import * as P from '../lab/perf.js';
import * as HS from '../lab/history.js';
import { S } from '../store.js';
import { h, money, pct, num, dateStr, section, table, btn, stat, empty, toast, rowList } from '../ui.js';
import { lineChart, signedBars, hbars } from '../charts.js';
import { LAB, selBooks, activeAccounts, rerender, quote, rs2, today, plRs, plPct, signedRs, tone, openStock } from './lab-shared.js';

const INDEX = { sym: 'NIFTY', yahoo: '^NSEI', label: 'NIFTY 50' };
let range = 'All', loading = '';
const RANGES = [['3M', 92], ['6M', 183], ['1Y', 366], ['All', 0]];

async function loadMany(list, label) {
  if (loading) return;
  if (!S.remote) return toast('Price history needs the Google Drive backend. Connect it in Settings.', 'bad');
  loading = label; rerender();
  let done = 0, failed = [];
  for (const s of list) { try { await HS.load(s.sym, { yahoo: s.yahoo, fundamentals: false }); done++; } catch (e) { failed.push(`${s.sym}: ${e.message}`); } }
  loading = '';
  toast(failed.length ? `Loaded ${done} of ${list.length}. ${failed[0]}` : `Loaded history for ${done} ${done === 1 ? 'item' : 'items'}`, failed.length ? 'bad' : '');
  rerender();
}

const kv = (l, v, s) => h('div', { class: 'kv' }, h('span', { class: 'kv-l' }, l), h('b', { class: 'kv-v' }, v == null ? '–' : v), s ? h('small', { class: 'kv-s' }, s) : null);

export function render() {
  const lab = LAB(), root = h('div', { class: 'page insights' });
  if (!activeAccounts(lab).length) { root.append(empty('Create a trading account and place a few trades to see insights.')); return root; }
  const sel = selBooks(), ids = new Set(sel.map((b) => b.acct.id)), ledgers = sel.map((b) => lab.txns.filter((t) => t.acct === b.acct.id)), txns = ledgers.flat(), now = today();
  if (!txns.some((t) => t.type !== 'deposit' && t.type !== 'withdraw')) { root.append(section('Insights', h('div', null, empty('No trades yet. Insights appear after your first orders.'), h('p', { class: 'note' }, 'You can back-date trades to practise on history: start the account on an earlier date and load that share’s price history on its page.')))); return root; }
  const totals = BK.totals(sel), closed = P.closedTrades(ledgers), stats = P.tradeStats(closed), xi = P.portfolioXirr(txns, totals.value, now), days = P.historyDays(txns, now);
  const bench = HS.hasHistory(INDEX.sym) ? P.benchmark(txns, (d) => HS.closeOn(INDEX.sym, d), now) : null;
  const eq = P.equityCurve(ledgers, HS.closeOn, quote, now), cs = P.curveStats(eq.points);
  const strat = BK.strategyPnl(lab, quote, Date.now(), ids), pickFor = { Stocks: (t) => (t.type === 'buy' || t.type === 'sell') && !t.basket, Baskets: (t) => (t.type === 'buy' || t.type === 'sell') && !!t.basket, Options: (t) => t.type === 'obuy' || t.type === 'osell' || t.type === 'oexp' };
  const stratRows = Object.entries(strat).filter(([, s]) => s.orders > 0).map(([k, s]) => { const cl = closed.filter((c) => c.kind === k), cst = P.tradeStats(cl); return { name: k, ...s, xirr: P.groupXirr(txns, pickFor[k], s.value, now), closed: cl.length, winRate: cl.length ? cst.winRate : null }; });
  const holds = sel.flatMap((b) => b.v.holdings.map((p) => ({ symbol: p.symbol, value: p.value })));
  const feesPct = stats.total > 0 ? totals.fees / stats.total : null;
  const finds = P.findings({ stats, xirr: xi, days, bench, totals, holdings: holds, strategies: Object.fromEntries(stratRows.map((r) => [r.name, r])), cashPct: totals.value ? totals.cash / totals.value : null, feesPct, curve: cs });

  // ----- headline -----
  const lead = bench && bench.xirr != null && xi != null ? xi - bench.xirr : null;
  root.append(h('div', { class: 'stats lab-stats' },
    stat('Your XIRR', xi == null ? '–' : plPct(xi, 1), xi == null ? 'needs 30+ days of history' : days < 90 ? `${days} days of history: annualised figures can mislead` : 'annualised, on money put in'),
    stat(`vs ${INDEX.label}`, lead != null ? h('span', { class: lead >= 0 ? 'pos' : 'neg' }, (lead >= 0 ? '▲ +' : '▼ ') + pct(lead, 1) + ' a year') : '–', lead != null ? `index XIRR ${pct(bench.xirr, 1)} on the same deposits` : bench ? 'needs 30+ days of history' : 'load the index below to compare'),
    stat('Win rate', stats.n ? pct(stats.winRate, 0) : '–', `${stats.wins} won · ${stats.losses} lost · ${stats.n} closed`),
    stat('Profit factor', stats.profitFactor == null ? '–' : Number.isFinite(stats.profitFactor) ? stats.profitFactor.toFixed(2) : '∞', 'money won per ₹1 lost'),
    stat('Expectancy', stats.n ? plRs(stats.expectancy) : '–', 'average result per closed trade'),
    stat('Worst fall', cs.maxDrawdown == null ? '–' : h('span', { class: cs.maxDrawdown < -0.005 ? 'neg' : '' }, pct(cs.maxDrawdown, 1)), cs.ddFrom ? `${dateStr(cs.ddFrom)} to ${dateStr(cs.ddTo)}` : 'peak to trough')));

  // ----- findings -----
  root.append(section('What the numbers say', h('div', null, finds.length ? h('ul', { class: 'finds' }, finds.map((f) => h('li', { class: 'find ' + f.tone }, h('b', null, f.title), h('p', null, f.text)))) : empty('Not enough activity to say anything yet.'),
    h('p', { class: 'note' }, 'These are observations from your own closed trades and prices. They describe the past; they are not advice and cannot tell you what a strategy will do next.'))));

  // ----- equity curve -----
  const cut = (() => { const d = (RANGES.find((r) => r[0] === range) || RANGES[3])[1]; return d ? new Date(Date.parse(now + 'T00:00:00Z') - d * 864e5).toISOString().slice(0, 10) : ''; })();
  const pts = eq.points.filter((p) => !cut || p.date >= cut), bser = HS.hasHistory(INDEX.sym) ? P.benchmarkSeries(eq.points, (d) => HS.closeOn(INDEX.sym, d)).slice(eq.points.length - pts.length) : null;
  const need = [...new Set(eq.missing)];
  const loadBtns = h('div', { class: 'row' },
    h('button', { type: 'button', class: 'small', disabled: !!loading, onclick: () => loadMany([INDEX], 'index') }, loading === 'index' ? 'Loading…' : HS.hasHistory(INDEX.sym) ? `Reload ${INDEX.label}` : `Load ${INDEX.label} history`),
    need.length ? h('button', { type: 'button', class: 'small', disabled: !!loading, onclick: () => loadMany(need.map((sym) => ({ sym, yahoo: '' })), 'shares') }, loading === 'shares' ? 'Loading…' : `Load history for ${need.length} share${need.length === 1 ? '' : 's'}`) : null);
  root.append(section('Account value over time', h('div', null,
    h('div', { class: 'chipset-inline' }, RANGES.map(([k]) => h('button', { type: 'button', class: 'chipopt' + (k === range ? ' on' : ''), 'aria-pressed': String(k === range), onclick: () => { range = k; rerender(); } }, k))),
    pts.length >= 2 ? lineChart({ labels: pts.map((p) => dateStr(p.date).replace(/ \d{4}$/, '')), tipLabels: pts.map((p) => dateStr(p.date)), fmt: money, area: true, yMax: Math.ceil(Math.max(...pts.map((p) => Math.max(p.value, p.deposited, ...(bser && bser[pts.indexOf(p)] != null ? [bser[pts.indexOf(p)]] : [])))) * 1.04 / 1000) * 1000, yMin: Math.floor(Math.min(...pts.map((p) => Math.min(p.value, p.deposited, ...(bser ? [bser[pts.indexOf(p)] ?? Infinity] : [])))) * 0.9 / 1000) * 1000,
      series: [{ name: 'Account value', values: pts.map((p) => p.value) }, { name: 'Money put in', values: pts.map((p) => p.deposited), dashed: true, color: 3 }, ...(bser ? [{ name: `Same money in ${INDEX.label}`, values: bser, color: 1 }] : [])] }) : empty('Not enough days to draw a curve yet.'),
    h('p', { class: 'note' }, eq.approx ? `Rebuilt from your orders. ${need.slice(0, 4).join(', ')}${need.length > 4 ? ' and more' : ''} ${need.length === 1 ? 'has' : 'have'} no saved price history, so ${need.length === 1 ? 'its' : 'their'} value between trades uses the last price you traded at. Options are carried at cost.` : 'Rebuilt from your orders and the daily prices you loaded. Options are carried at cost.'),
    loadBtns)));

  // ----- strategies -----
  root.append(section('Which approach is working', h('div', null, table([
    { label: 'Approach', host: true, get: (r) => r.name }, { label: 'Orders', cls: 'r', mob: 'under', mlabel: '', get: (r) => String(r.orders) },
    { label: 'Money spent', cls: 'r', get: (r) => money(r.spent) }, { label: 'Profit / loss', cls: 'r', render: (r) => plRs(r.pnl) }, { label: 'Return', cls: 'r', render: (r) => plPct(r.ret, 1) },
    { label: 'XIRR', cls: 'r', render: (r) => (r.xirr == null ? h('span', { class: 'muted' }, '–') : plPct(r.xirr, 1)) }, { label: 'Win rate', cls: 'r', show: 'desk', get: (r) => (r.winRate == null ? '–' : pct(r.winRate, 0) + ` of ${r.closed}`) },
  ], stratRows, { empty: 'No orders yet.', m: { key: 'tl-ins-st', head: 'Approach', sub: ['Orders'], views: [['Profit / loss', 'Return'], ['XIRR', 'Win rate'], ['Money spent']] } }),
  h('p', { class: 'note' }, 'Plain stock orders, basket orders and option orders are measured separately: money spent, money back, and what is still open at today’s price, charges included.'))));

  // ----- closed trades -----
  if (stats.n) {
    const mo = P.monthlyRealised(closed), sy = P.bySymbol(closed), tr = (c) => ({ title: c.symbol, sub: `${dateStr(c.date)} · held ${Math.round(c.held)} days`, value: plRs(c.gain), valueSub: plPct(c.ret, 1), onClick: () => openStock(c.symbol) });
    root.append(section('Closed trades', h('div', null,
      h('div', { class: 'kvs' }, kv('Closed trades', num(stats.n), `${stats.wins} won · ${stats.losses} lost`), kv('Average win', plRs(stats.avgWin), stats.wins ? pct(stats.avgWinPct, 1) : ''), kv('Average loss', stats.losses ? plRs(-stats.avgLoss) : '–', stats.losses ? pct(stats.avgLossPct, 1) : ''),
        kv('Payoff ratio', stats.payoff == null ? '–' : stats.payoff.toFixed(2) + '×', 'average win ÷ average loss'), kv('Held (winners)', stats.holdWin == null ? '–' : Math.round(stats.holdWin) + ' days'), kv('Held (losers)', stats.holdLoss == null ? '–' : Math.round(stats.holdLoss) + ' days'),
        kv('Booked profit', plRs(stats.total), `charges paid ${money(totals.fees)}`)),
      h('div', { class: 'movers two' }, h('div', { class: 'mvbox' }, h('h3', { class: 'mini-title' }, 'Best trades'), rowList(closed.slice().sort((a, b) => b.gain - a.gain).filter((c) => c.gain > 0).slice(0, 3).map(tr), { empty: 'No winning trades yet.' })),
        h('div', { class: 'mvbox' }, h('h3', { class: 'mini-title' }, 'Worst trades'), rowList(closed.slice().sort((a, b) => a.gain - b.gain).filter((c) => c.gain < 0).slice(0, 3).map(tr), { empty: 'No losing trades yet.' }))),
      mo.length > 1 ? [h('h3', { class: 'mini-title' }, 'Booked profit by month'), signedBars({ items: mo.map((m) => ({ label: m.month.slice(2).replace('-', '/'), title: m.month + ` · ${m.trades} trade${m.trades === 1 ? '' : 's'}`, value: m.gain })), fmt: signedRs })] : null,
      sy.length > 1 ? [h('h3', { class: 'mini-title' }, 'Booked profit by share'), hbars(sy.slice(0, 8).map((s) => ({ label: s.symbol, value: Math.abs(s.gain), ci: s.gain >= 0 ? 2 : 7 })), { fmt: (v) => money(v), onClick: (r) => openStock(r.label) }), h('p', { class: 'note' }, 'Green bars made money, red bars lost it; the length shows how much.')] : null)));
  }
  return root;
}
