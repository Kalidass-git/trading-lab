// Trading Lab: one mutual fund (#/fund/CODE) or one index (#/index/SYM) on one page. Chart, returns over 1 month to 10 years, rolling returns
// compared with an index, growth of 100, a SIP back-test, risk and calendar-year returns. Data loads only when a button is pressed.
import * as FD from '../lab/funds.js';
import * as HS from '../lab/history.js';
import * as MK from '../lab/market.js';
import * as SR from '../lab/series.js';
import * as LN from '../lab/lines.js';
import { S } from '../store.js';
import { h, money, pct, dec, dateStr, section, table, dialog, formDialog, rowList, empty, route, toast, canEdit, confirmDialog } from '../ui.js';
import { lineChart } from '../charts.js';
import { LAB, rerender, quote, rs2, run, today, ago, chg, plRs, selectOf, field } from './lab-shared.js';
import * as TK from './chartkit.js';

const ui = { win: 36, sip: 10000, sipYears: 0, bench: {} };
const WINS = [[12, '1 year'], [36, '3 years'], [60, '5 years'], [120, '10 years']];
const short = (n) => String(n || '').split(' - ')[0].replace(/\s+(Fund|Index)$/i, (m) => m).trim() || String(n || '');
const pp = (v) => (v == null ? '–' : (v > 0 ? '+' : '') + (v * 100).toFixed(1) + ' pts');
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const my = (iso) => `${MON[Number(iso.slice(5, 7)) - 1]} ${iso.slice(2, 4)}`;
const every = (len, max = 240) => { const step = Math.max(1, Math.ceil(len / max)), idx = []; for (let i = 0; i < len; i += step) idx.push(i); if (idx[idx.length - 1] !== len - 1) idx.push(len - 1); return idx; };
const asSeries = (hist, name) => ({ name, d: hist.d, c: hist.c });
const kv = (l, v, s) => h('div', { class: 'kv' }, h('span', { class: 'kv-l' }, l), h('b', { class: 'kv-v' }, v == null || v === '' ? '–' : v), s ? h('small', { class: 'kv-s' }, s) : null);
const chip = (label, on, fn) => h('button', { type: 'button', class: 'chipopt' + (on ? ' on' : ''), 'aria-pressed': String(on), onclick: fn }, label);

let busy = false;
export async function loadIndexBtn(btn, ix, label = 'Load history') {
  if (busy) return;
  if (!S.remote) return toast('Index history needs the Google Drive backend. Connect it in Settings.', 'bad');
  busy = true; if (btn) { btn.disabled = true; btn.textContent = 'Loading…'; }
  try { const prev = HS.dataOf(ix.sym); await FD.loadIndex(ix, prev ? null : '10y'); toast(ix.name + ' loaded'); } catch (e) { toast(`${ix.name}: ${e.message}. If the code ${ix.yahoo} is wrong for Yahoo, use Edit code.`, 'bad'); }
  busy = false; rerender();
}
async function loadFundBtn(btn, code) {
  if (busy) return;
  busy = true; if (btn) { btn.disabled = true; btn.textContent = 'Loading…'; }
  try { const r = await FD.load(code); toast(short(r.name) + ' loaded'); } catch (e) { toast(e.message, 'bad'); }
  busy = false; rerender();
}

// ---------- panels shared by funds and indexes. a is the main series, b the one it is compared with (or null) ----------
function returnsPanel(a, b) {
  const ra = SR.periodReturns(a.d, a.c), rb = b ? SR.periodReturns(b.d, b.c) : null;
  const rows = ra.map((r, i) => ({ label: r.label + (r.annual ? ' (a year)' : ''), a: r.value, b: rb ? rb[i].value : null })).filter((r) => r.a != null || r.b != null);
  if (!rows.length) return null;
  const cols = [{ label: 'Period', host: true, get: (r) => r.label }, { label: short(a.name), cls: 'r', render: (r) => chg(r.a, 1) }];
  if (b) cols.push({ label: short(b.name), cls: 'r', render: (r) => chg(r.b, 1) }, { label: 'Gap', cls: 'r', render: (r) => (r.a == null || r.b == null ? h('span', { class: 'muted' }, '–') : h('span', { class: 'pl ' + (r.a - r.b > 0.0005 ? 'pos' : r.a - r.b < -0.0005 ? 'neg' : '') }, pp(r.a - r.b))) });
  return section('Returns', h('div', null, table(cols, rows), h('p', { class: 'note' }, 'Up to 6 months is the plain change. From 1 year the figure is a yearly rate, so 3 years and 5 years can be compared with 1 year directly. Past returns say little about the future.')));
}
function rollingPanel(a, b) {
  const win = (WINS.find((w) => w[0] === ui.win && SR.dayNo(a.d[a.d.length - 1]) - SR.dayNo(a.d[0]) > w[0] * 30.4 + 30) || WINS[0])[0];
  const winLabel = (WINS.find((w) => w[0] === win) || WINS[0])[1];
  const picks = h('div', { class: 'chipset-inline' }, WINS.filter((w) => SR.dayNo(a.d[a.d.length - 1]) - SR.dayNo(a.d[0]) > w[0] * 30.4 + 30).map(([m, l]) => chip(l, m === win, () => { ui.win = m; rerender(); })));
  const head = h('div', null, h('p', { class: 'note' }, 'A rolling return is the return you would have got by investing on any one day and holding for the chosen period. Plotting every start day shows how much luck the start date contributed.'), picks);
  if (!b) {
    const r = SR.rolling(a.d, a.c, win), st = SR.stats(r);
    if (!st) return section('Rolling returns', h('div', null, head, h('p', { class: 'muted' }, `Not enough history for ${winLabel} windows.`)));
    return section('Rolling returns', h('div', null, head, rollingChart([{ name: short(a.name), d: a.d, v: r }]), rollingStats([{ name: short(a.name), st }]), histogram(r), h('p', { class: 'fx-verdict' }, `Holding ${winLabel} from any day, ${short(a.name)} gave a positive return ${(st.positive * 100).toFixed(0)}% of the time. The middle result was ${(st.median * 100).toFixed(1)}% ${win >= 12 ? 'a year' : ''}; the worst was ${(st.min * 100).toFixed(1)}% and the best ${(st.max * 100).toFixed(1)}%.`)));
  }
  const cmp = SR.compareRolling(a, b, win);
  if (!cmp.n) return section('Rolling returns against ' + short(b.name), h('div', null, head, h('p', { class: 'muted' }, `The two histories do not overlap enough for ${winLabel} windows. Load a longer history for ${short(b.name)} or pick a shorter window.`)));
  const idx = every(cmp.d.length), verdict = `Across ${cmp.n.toLocaleString('en-IN')} ${winLabel} windows (${dateStr(cmp.d[0])} to ${dateStr(cmp.d[cmp.d.length - 1])}), ${short(a.name)} came out ahead of ${short(b.name)} ${(cmp.ahead * 100).toFixed(0)}% of the time. The middle gap was ${pp(cmp.gap.median)}; the worst lag was ${pp(cmp.gap.min)} and the best lead ${pp(cmp.gap.max)}.`;
  return section('Rolling returns against ' + short(b.name), h('div', null, head,
    rollingChart([{ name: short(a.name), d: idx.map((i) => cmp.d[i]), v: idx.map((i) => cmp.a[i]) }, { name: short(b.name), d: idx.map((i) => cmp.d[i]), v: idx.map((i) => cmp.b[i]), dashed: true }]),
    h('p', { class: 'fx-verdict' }, verdict), rollingStats([{ name: short(a.name), st: cmp.fund }, { name: short(b.name), st: cmp.bench }]),
    h('h3', { class: 'mini-title' }, 'How the fund’s ' + winLabel + ' returns were spread'), histogram(cmp.a)));
}
function rollingChart(series) {
  const labels = series[0].d.map(my), pctv = (a) => a.map((x) => (x == null ? null : x * 100));
  return lineChart({ labels, tipLabels: series[0].d.map(dateStr), series: series.map((s, i) => ({ name: s.name, values: pctv(s.v), dashed: s.dashed })), fmt: (v) => v.toFixed(1) + '%', height: 230 });
}
function rollingStats(cols) {
  const f = (v) => (v == null ? '–' : (v * 100).toFixed(1) + '%'), rows = [['Average', (s) => f(s.mean)], ['Middle (median)', (s) => f(s.median)], ['Best', (s) => f(s.max)], ['Worst', (s) => f(s.min)], ['Gave a profit', (s) => (s.positive * 100).toFixed(0) + '% of windows']];
  return table([{ label: 'Rolling return', host: true, get: (r) => r[0] }, ...cols.map((c) => ({ label: c.name, cls: 'r', get: (r) => r[1](c.st) }))], rows);
}
function histogram(values) {
  const bins = SR.histogram(values, 12); if (!bins.length) return null;
  const mx = Math.max(...bins.map((b) => b.count), 1), p = (v) => (v * 100).toFixed(0) + '%';
  return h('div', null, h('div', { class: 'fx-hist', role: 'img', 'aria-label': 'Spread of rolling returns' }, bins.map((b) => h('span', { class: b.to <= 0 ? 'neg' : '', title: `${p(b.from)} to ${p(b.to)}: ${b.count} windows`, style: { height: Math.max(2, (b.count / mx) * 100) + '%' } }))),
    h('div', { class: 'fx-hist-l' }, h('span', null, p(bins[0].from)), h('span', null, 'return'), h('span', null, p(bins[bins.length - 1].to))));
}
function growthPanel(a, b) {
  if (!b) return null;
  const rp = SR.rebasedPair(a, b); if (!rp) return null;
  const idx = every(rp.d.length);
  return section('Growth of 100', h('div', null, lineChart({ labels: idx.map((i) => my(rp.d[i])), tipLabels: idx.map((i) => dateStr(rp.d[i])), series: [{ name: short(a.name), values: idx.map((i) => rp.a[i]) }, { name: short(b.name), values: idx.map((i) => rp.b[i]), dashed: true }], fmt: (v) => v.toFixed(0), yMin: Math.floor(Math.min(...rp.a, ...rp.b, 100) / 10) * 10, height: 230 }),
    h('p', { class: 'note' }, `From ${dateStr(rp.d[0])}, 100 put into each. ${short(a.name)} is now ${rp.a[rp.a.length - 1].toFixed(0)}, ${short(b.name)} ${rp.b[rp.b.length - 1].toFixed(0)}.`)));
}
function sipPanel(a, b) {
  const years = [[0, 'All'], [3, '3 years'], [5, '5 years'], [10, '10 years']];
  const last = a.d[a.d.length - 1], first = b ? (a.d[0] > b.d[0] ? a.d[0] : b.d[0]) : a.d[0];
  const start = ui.sipYears ? (SR.monthsBack(last, ui.sipYears * 12) > first ? SR.monthsBack(last, ui.sipYears * 12) : first) : first;
  const ra = SR.sip(a.d, a.c, { amount: ui.sip, startDate: start }), rb = b ? SR.sip(b.d, b.c, { amount: ui.sip, startDate: start }) : null;
  const la = SR.lumpsum(a.d, a.c, { amount: ui.sip * 12, startDate: start }), lb = b ? SR.lumpsum(b.d, b.c, { amount: ui.sip * 12, startDate: start }) : null;
  if (!ra) return null;
  const amt = h('input', { type: 'number', min: 100, step: 500, value: ui.sip, 'aria-label': 'Monthly amount', onchange: (e) => { const v = Number(e.target.value); if (v > 0) { ui.sip = v; rerender(); } } });
  const cols = [{ label: '', host: true, get: (r) => r[0] }, { label: short(a.name), cls: 'r', get: (r) => r[1] }, ...(b ? [{ label: short(b.name), cls: 'r', get: (r) => r[2] }] : [])];
  const row = (lbl, f) => [lbl, f(ra, la), b && rb ? f(rb, lb) : '–'];
  return section('SIP back-test', h('div', null, h('div', { class: 'row' }, h('label', { class: 'field' }, h('span', null, 'Monthly SIP (₹)'), amt), h('div', { class: 'chipset-inline' }, years.map(([y, l]) => chip(l, y === ui.sipYears, () => { ui.sipYears = y; rerender(); })))),
    table(cols, [row('Months invested', (s) => String(s.months)), row('Total invested', (s) => money(s.invested)), row('Worth today', (s) => money(s.value)), row('Gain', (s) => plRs(s.gain)), row('Yearly rate (XIRR)', (s) => (s.xirr == null ? '–' : chg(s.xirr, 1))), [`One lump sum of ${money(ui.sip * 12)} on ${dateStr(la ? la.from : start)}`, la ? money(la.value) : '–', lb ? money(lb.value) : '–']]),
    h('p', { class: 'note' }, `A SIP buys on the first trading day of every month from ${dateStr(start)} to ${dateStr(last)}. No charges, taxes or exit loads are included.`)));
}
function riskPanel(a, b) {
  const ra = SR.riskStats(a.d, a.c), rb = b ? SR.riskStats(b.d, b.c) : null; if (!ra) return null;
  const f = (r, k) => (r ? (k === 'vol' ? (r.vol * 100).toFixed(1) + '%' : k === 'dd' ? (r.maxDrawdown * 100).toFixed(1) + '%' : (r.fromPeak * 100).toFixed(1) + '%') : '–');
  const rows = [['Ups and downs (yearly volatility)', 'vol'], ['Deepest fall from a peak', 'dd'], ['Now versus its peak', 'now']];
  return section('Risk', h('div', null, table([{ label: 'Measure', host: true, get: (r) => r[0] }, { label: short(a.name), cls: 'r', get: (r) => f(ra, r[1]) }, ...(b ? [{ label: short(b.name), cls: 'r', get: (r) => f(rb, r[1]) }] : [])], rows),
    h('p', { class: 'note' }, `The deepest fall for ${short(a.name)} ran from ${dateStr(ra.ddFrom)} to ${dateStr(ra.ddTo)}. A smaller fall means a smoother ride.`)));
}
function yearsPanel(a, b) {
  const ya = SR.calendarYears(a.d, a.c); if (!ya.length) return null;
  const yb = b ? new Map(SR.calendarYears(b.d, b.c).map((y) => [y.year, y])) : null;
  const cols = [{ label: 'Year', host: true, get: (r) => r.year + (r.partial ? ' (' + r.partial + ')' : '') }, { label: short(a.name), cls: 'r', render: (r) => chg(r.value, 1) }, ...(b ? [{ label: short(b.name), cls: 'r', render: (r) => chg(yb.has(r.year) ? yb.get(r.year).value : null, 1) }, { label: 'Gap', cls: 'r', render: (r) => (yb.has(r.year) && r.value != null ? h('span', { class: 'pl ' + (r.value - yb.get(r.year).value > 0.0005 ? 'pos' : r.value - yb.get(r.year).value < -0.0005 ? 'neg' : '') }, pp(r.value - yb.get(r.year).value)) : h('span', { class: 'muted' }, '–')) }] : [])];
  return section('Year by year', table(cols, [...ya].reverse()));
}
const analysis = (a, b) => [returnsPanel(a, b), rollingPanel(a, b), growthPanel(a, b), sipPanel(a, b), riskPanel(a, b), yearsPanel(a, b)].filter(Boolean);

// ---------- a fund ----------
export function renderFund() {
  const code = decodeURIComponent(route().sub || ''), lab = LAB(), root = h('div', { class: 'page fund-page' }), rec = FD.dataOf(code);
  if (!code) { root.append(empty('Choose a fund from the Funds tab.')); return root; }
  const fol = FD.followed(lab).find((f) => f.code === code), name = (rec && rec.name) || (fol && fol.name) || 'Fund ' + code;
  const benchSym = (fol && fol.bench) || ui.bench[code] || FD.suggestBenchmark(name, rec && rec.category), bench = FD.indexBySym(lab, benchSym) || FD.indexBySym(lab, 'NIFTY'), bh = FD.seriesOfIndex(bench.sym);
  const last = rec ? rec.c[rec.c.length - 1] : null, prev = rec && rec.c.length > 1 ? rec.c[rec.c.length - 2] : null;
  const loadBtn = h('button', { type: 'button', class: rec ? 'small' : 'primary', onclick: (e) => loadFundBtn(e.currentTarget, code) }, rec ? 'Reload NAV' : 'Load NAV history');
  const benchSel = selectOf(FD.indexList(lab).map((x) => ({ value: x.sym, label: x.name })), bench.sym, { 'aria-label': 'Compare with index', onchange: (e) => { if (fol) run((l) => { const f = (l.funds || []).find((x) => x.code === code); if (f) f.bench = e.target.value; }); else { ui.bench[code] = e.target.value; rerender(); } } });
  root.append(h('header', { class: 'card sp-head fx-head' },
    h('div', { class: 'sp-title' }, h('a', { class: 'sp-back', href: '#/funds/funds', 'aria-label': 'Back to funds' }, '‹'), h('div', null, h('h2', null, name), h('p', { class: 'muted' }, [rec && rec.house, rec && rec.category, FD.planOf(name), FD.optionOf(name), 'Code ' + code].filter(Boolean).join(' · ')))),
    h('div', { class: 'sp-price' }, h('b', null, last != null ? rs2(last) : '–'), last != null && prev ? h('span', { class: 'sp-day' }, chg(last / prev - 1)) : null, rec ? h('small', { class: 'muted' }, `NAV of ${dateStr(rec.d[rec.d.length - 1])}, loaded ${ago(rec.ts)}`) : h('small', { class: 'muted' }, 'no NAV history on this device yet')),
    h('div', { class: 'fx-bench' }, h('label', { class: 'fx-note' }, 'Compare with ', benchSel), canEdit() ? h('button', { type: 'button', class: 'small' + (fol ? ' on' : ''), 'aria-pressed': String(!!fol), onclick: () => run((l) => { l.funds = l.funds || []; const i = l.funds.findIndex((f) => f.code === code); if (i >= 0) l.funds.splice(i, 1); else l.funds.push({ id: 'fu' + code, code, name, bench: bench.sym }); }, fol ? 'Removed from your funds' : 'Added to your funds') }, fol ? '★ Following' : '☆ Follow') : null, loadBtn)));
  if (!rec) { root.append(section('NAV history', h('div', null, h('p', null, S.remote ? 'No history yet. One press brings the full NAV history of this fund from the fund-data service. It is kept on this device and never refreshes by itself.' : 'Fund data needs the Google Drive backend. Connect it in Settings.')))); return root; }
  const a = asSeries({ d: rec.d, c: rec.c }, name), b = bh ? asSeries(bh, bench.name) : null;
  root.append(section('NAV chart', TK.chartCard({ key: 'fund:' + code, kind: 'fund', hist: FD.seriesOfFund(code), today: today(), canEdit: false, trades: [], avgCost: null, firstBuy: null, lines: [], store: null, priceLabel: 'NAV', note: `NAV history from ${dateStr(rec.d[0])} to ${dateStr(rec.d[rec.d.length - 1])}. It does not update by itself: press “Reload NAV”.` })));
  if (!b) root.append(section('Compare with ' + bench.name, h('div', null, h('p', null, `Rolling returns, growth, SIP and year-by-year figures are shown against ${bench.name}. Its history is not on this device yet.`), h('button', { type: 'button', class: 'primary', onclick: (e) => loadIndexBtn(e.currentTarget, bench) }, 'Load ' + bench.name + ' history'))));
  root.append(...analysis(a, b));
  const notes = [b ? `${bench.name} is a price index: it leaves out dividends, while a fund’s NAV includes them. That makes the fund look slightly better than it is. Where you can, compare with a total-return index (add one in Indexes).` : null,
    FD.planOf(name) === 'Regular' ? 'This is a Regular plan, which has a higher cost than the Direct plan of the same fund. Compare like with like.' : null, 'NAV history comes from the free mfapi.in service (it republishes AMFI data) and can lag or have gaps.'].filter(Boolean);
  root.append(h('section', { class: 'card' }, h('h2', null, 'Good to know'), h('ul', { class: 'fx-notes' }, notes.map((n) => h('li', { class: 'fx-note' }, n))),
    canEdit() ? h('p', null, h('button', { type: 'button', class: 'small danger', onclick: async () => { if (await confirmDialog(`Remove the saved NAV history of this fund from this device?${fol ? ' It stays in your followed funds.' : ''}`, 'Remove')) { FD.remove(code); rerender(); } } }, 'Remove NAV from this device')) : null));
  return root;
}

// ---------- an index ----------
function editIndex(ix) {
  formDialog({ title: 'Edit ' + ix.name, fields: [{ key: 'name', label: 'Name', required: true }, { key: 'yahoo', label: 'Yahoo Finance code', required: true, hint: 'For example ^NSEI. Search the index on finance.yahoo.com and copy the code in the address.' }], value: ix, saveLabel: 'Save',
    onSave: (v) => { run((l) => { l.indexes = l.indexes || []; const row = l.indexes.find((x) => x.sym === ix.sym), next = { id: 'ix' + ix.sym, sym: ix.sym, name: String(v.name).trim(), yahoo: String(v.yahoo).trim(), group: ix.group || 'Mine' }; if (row) Object.assign(row, next); else l.indexes.push(next); }, 'Saved'); } });
}
export function renderIndex() {
  const sym = FD.cleanSym(decodeURIComponent(route().sub || '')), lab = LAB(), root = h('div', { class: 'page fund-page' }), ix = FD.indexBySym(lab, sym);
  if (!ix) { root.append(empty('That index is not in the list. Open the Indexes tab to add it.')); return root; }
  const rec = HS.dataOf(ix.sym), hist = FD.seriesOfIndex(ix.sym), q = quote(ix.sym), dayCh = q && q.prevClose > 0 ? q.price / q.prevClose - 1 : null;
  const loadBtn = h('button', { type: 'button', class: hist ? 'small' : 'primary', onclick: (e) => loadIndexBtn(e.currentTarget, ix) }, hist ? 'Reload' : 'Load history');
  root.append(h('header', { class: 'card sp-head fx-head' },
    h('div', { class: 'sp-title' }, h('a', { class: 'sp-back', href: '#/funds/indexes', 'aria-label': 'Back to indexes' }, '‹'), h('div', null, h('h2', null, ix.name), h('p', { class: 'muted' }, `${ix.group || 'Index'} · Yahoo code ${ix.yahoo}`))),
    h('div', { class: 'sp-price' }, h('b', null, q ? dec(q.price, 2) : hist ? dec(hist.c[hist.c.length - 1], 2) : '–'), dayCh != null ? h('span', { class: 'sp-day' }, chg(dayCh)) : null, rec ? h('small', { class: 'muted' }, `history to ${dateStr(rec.hist.d[rec.hist.d.length - 1])}, loaded ${ago(rec.ts)}`) : h('small', { class: 'muted' }, 'no history on this device yet')),
    h('div', { class: 'fx-bench' }, canEdit() ? h('button', { type: 'button', class: 'small', onclick: () => editIndex(ix) }, 'Edit code') : null, hist && rec.range !== '10y' && rec.range !== 'max' ? h('button', { type: 'button', class: 'small', onclick: async (e) => { e.currentTarget.disabled = true; try { await FD.loadIndex(ix, '10y'); toast('10 years loaded'); } catch (er) { toast(er.message, 'bad'); } rerender(); } }, 'Load 10 years') : null, loadBtn)));
  if (!hist) { root.append(section('History', h('div', null, h('p', null, S.remote ? 'No history yet. One press brings up to ten years of daily index levels from Yahoo Finance. It is kept on this device and never refreshes by itself.' : 'Index history needs the Google Drive backend. Connect it in Settings.'), h('p', { class: 'note' }, `The Yahoo code ${ix.yahoo} was set from memory and not checked from here. If nothing loads, press Edit code and enter the right one.`)))); return root; }
  const key = 'IDX-' + ix.sym, once = (fn) => { let id = null; run((l) => { id = fn(l); }); return id; };
  const store = { add: (ln) => once((l) => LN.addLine(l, key, ln)), update: (id, patch) => run((l) => LN.updateLine(l, id, patch)), remove: (id) => run((l) => LN.removeLine(l, id), 'Line deleted'), clear: () => run((l) => LN.clearLines(l, key), 'Lines removed') };
  root.append(section('Index chart', TK.chartCard({ key, kind: 'index', hist, today: today(), canEdit: canEdit(), trades: [], avgCost: null, firstBuy: null, lines: LN.linesFor(lab, key), store, priceLabel: 'Level', note: `Daily levels up to ${dateStr(hist.d[hist.d.length - 1])}. Index levels do not include dividends.` })));
  root.append(...analysis(asSeries(hist, ix.name), null));
  const mine = FD.followed(lab).filter((f) => (f.bench || FD.suggestBenchmark(f.name)) === ix.sym);
  if (mine.length) root.append(section('Your funds compared with this index', rowList(mine.map((f) => ({ title: short(f.name), sub: FD.planOf(f.name) || 'Fund', value: 'Compare', onClick: () => { location.hash = '#/fund/' + encodeURIComponent(f.code); } })))));
  return root;
}
export { short as shortName, every, my };
