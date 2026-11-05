// Trading Lab: the chart card. A toolbar (range, type, bars, lines, zoom, colours, trendline), the chart itself, a colours panel, the trendline
// pop-up with alerts, and a full-screen view. The chart (tchart.js) only draws and reports back; this file owns the settings and the saving.
// Settings live on this device only. Trendlines and alerts are saved with the person's data through `o.store`, so the page that uses this
// card decides how they are saved. Nothing here fetches data.
import { h, dialog, confirmDialog, dec } from '../ui.js';
import { tchart, TL_COLORS, TL_NAMES, UP, DOWN } from '../tchart.js';
import * as SR from '../lab/series.js';
import { selectOf, field, chg } from './lab-shared.js';

export const DEFAULT_COLORS = { ma50: '#2962ff', ma200: '#ff9800', ind: '#9c27b0', median: '#e91e63', avg: '#b08900', up: UP, down: DOWN };
const PRESETS = ['#2962ff', '#ff9800', '#9c27b0', '#e91e63', '#b08900', '#00b8d4', '#089981', '#f23645', '#43a047', '#607d8b'];
const RANGES = ['1M', '3M', '6M', '1Y', '3Y', '5Y', 'Max'];
const DAYS = { '1M': 31, '3M': 92, '6M': 183, '1Y': 366, '3Y': 1096, '5Y': 1827 };
const BARS = [['auto', 'Auto'], ['day', 'Day'], ['week', 'Week'], ['month', 'Month']];
const WINDOWS = [[12, '1Y'], [36, '3Y'], [60, '5Y']];

// ---------- device storage, always wrapped ----------
const rd = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch { return d; } };
const wr = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* blocked or full: the chart still works */ } };
export const readColors = () => ({ ...DEFAULT_COLORS, ...rd('tl.chart.colors', {}) });
const saveColors = (c) => { const ch = {}; for (const k of Object.keys(DEFAULT_COLORS)) if (c[k] !== DEFAULT_COLORS[k]) ch[k] = c[k]; wr('tl.chart.colors', ch); };
export const colorsChanged = () => Object.keys(rd('tl.chart.colors', {})).length > 0;
const prefsKey = (kind) => 'tl.chart.' + kind;
const prefs = (kind) => ({ range: kind === 'share' ? '1Y' : '5Y', mode: 'line', bars: 'auto', ma50: false, ma200: false, ind: false, win: 36, newColor: TL_COLORS[0], ...rd(prefsKey(kind), {}) });

// ---------- kept in memory while the page is open ----------
const MEM = new Map();            // key -> { view, sel, pop, auto }
const full = { open: false, key: null };
let fsAsked = false;
const unlock = () => { document.body.classList.remove('tc-lock'); if (fsAsked && document.fullscreenElement) { try { document.exitFullscreen(); } catch { /* ignore */ } } fsAsked = false; };
window.addEventListener('hashchange', () => { full.open = false; full.key = null; unlock(); });
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && fsAsked && full.open) { full.open = false; fsAsked = false; document.body.classList.remove('tc-lock'); window.dispatchEvent(new Event('rerender')); } });

const spanDays = (hist, range, firstBuy) => { const n = hist.d.length, first = SR.dayNo(hist.d[0]), last = SR.dayNo(hist.d[n - 1]); return range === 'Max' ? last - first : range === 'My buy' && firstBuy ? last - SR.dayNo(firstBuy) + 14 : DAYS[range] || last - first; };
const startFor = (hist, range, firstBuy) => { const last = SR.dayNo(hist.d[hist.d.length - 1]); if (range === 'Max') return null; if (range === 'My buy' && firstBuy) return SR.fromDayNo(SR.dayNo(firstBuy) - 14); return DAYS[range] ? SR.fromDayNo(last - DAYS[range]) : null; };

/**
 * o: { key, kind: 'share' | 'index' | 'fund', hist (daily rows), today, canEdit, trades, avgCost, firstBuy, lines (saved trendlines), priceLabel, fmtPrice,
 *      store: { add(line) -> id, update(id, patch), remove(id), clear() }, note (text under the chart) }
 */
export function chartCard(o) {
  const mem = MEM.get(o.key) || (MEM.set(o.key, {}), MEM.get(o.key)), P = prefs(o.kind), colors = readColors(), hist = o.hist, n = hist.d.length;
  const fund = o.kind === 'fund', editor = !!o.canEdit && !fund, st = { colorsOpen: false, tool: null }, wrap = h('div', { class: 'tcard' }), holder = h('div', { class: 'tc-holder' });
  const isFull = () => full.open && full.key === o.key;
  const rangesList = o.firstBuy ? [...RANGES, 'My buy'] : RANGES;
  if (!rangesList.includes(P.range)) P.range = fund ? 'Max' : '1Y';
  const savePrefs = () => wr(prefsKey(o.kind), { range: P.range, mode: P.mode, bars: P.bars, ma50: P.ma50, ma200: P.ma200, ind: P.ind, win: P.win, newColor: P.newColor });
  if (mem.auto == null) mem.auto = SR.autoBars(spanDays(hist, P.range, o.firstBuy));
  const barsMode = () => (P.bars === 'auto' ? mem.auto : P.bars);
  if (fund && P.mode === 'candle') P.mode = 'line';
  let chart = null, rebuildTimer = null;

  // ---------- the chart ----------
  function buildChart(view) {
    const bars = SR.toBars(hist, barsMode()), lines = [];
    const sm = (vals) => SR.sampleAt(vals, bars, n);
    if (P.ma50) lines.push({ key: 'ma50', name: '50d', color: colors.ma50, values: sm(SR.sma(hist.c, 50)), width: 2.2 });
    if (P.ma200) lines.push({ key: 'ma200', name: '200d', color: colors.ma200, values: sm(SR.sma(hist.c, 200)), width: 2.2 });
    let panel = null;
    if (P.ind) panel = o.kind === 'share' ? { label: 'RSI 14', values: sm(SR.rsi(hist.c, 14)), color: colors.ind, fmt: (v) => v.toFixed(0) } : { label: 'Rolling ' + (WINDOWS.find((w) => w[0] === P.win) || WINDOWS[1])[1], values: sm(SR.rolling(hist.d, hist.c, P.win)), color: colors.ind, fmt: (v) => (v * 100).toFixed(1) + '%', median: true, zero: true };
    const phone = window.innerWidth < 700, f = isFull();
    const H1 = f ? Math.max(180, window.innerHeight - (phone ? 520 : 360)) : phone ? 230 : 280;
    const c = tchart({
      hist: bars, mode: P.mode, colors: { up: colors.up, down: colors.down }, lines, panel, medianColor: colors.median, avgColor: colors.avg, avgCost: o.avgCost, trades: o.trades,
      trend: fund ? [] : o.lines || [], tool: st.tool, newColor: P.newColor, selected: mem.sel || null, canEdit: editor, priceLabel: o.priceLabel,
      width: f ? Math.max(300, window.innerWidth - 24) : phone ? 380 : 880, height: H1, view: view || mem.view || null, fmtPrice: o.fmtPrice,
      onView: (v) => { mem.view = v; },
      onTool: (t) => { st.tool = t; renderBar(); },
      onLine: (ev) => {
        if (ev.type === 'select') { mem.sel = ev.id; mem.pop = ev.id ? { cx: ev.cx, cy: ev.cy, mx: ev.mx, my: ev.my } : null; renderPop(); return; }
        if (ev.type === 'add') { const id = o.store.add({ ...ev.line, color: P.newColor }); if (id) { mem.sel = id; mem.pop = { cx: 120, cy: 28 }; } return; }
        if (ev.type === 'change') o.store.update(ev.line.id, { d1: ev.line.d1, p1: ev.line.p1, d2: ev.line.d2, p2: ev.line.p2 });
      },
    });
    chart = c; holder.replaceChildren(c.el); renderPop(); return c;
  }
  const rebuild = () => { const v = chart ? chart.view() : mem.view; if (v) mem.view = v; buildChart(mem.view); };
  const resized = () => { clearTimeout(rebuildTimer); rebuildTimer = setTimeout(() => { if (wrap.isConnected && isFull()) rebuild(); }, 120); };
  window.addEventListener('resize', function again() { if (!wrap.isConnected) { window.removeEventListener('resize', again); return; } resized(); });

  // ---------- toolbar ----------
  const seg = (items, cur, pick, label) => h('div', { class: 'tcb-seg', role: 'group', 'aria-label': label }, items.map(([v, t]) => h('button', { type: 'button', class: v === cur ? 'on' : '', 'aria-pressed': String(v === cur), onclick: () => pick(v) }, t)));
  const pill = (label, on, click, color, title) => h('button', { type: 'button', class: 'tcb-pill' + (on ? ' on' : ''), 'aria-pressed': String(on), title: title || null, onclick: click }, color ? h('i', { style: { background: color } }) : null, label);
  const lab = (t) => h('span', { class: 'tcb-lab' }, t);
  const bar = h('div', { class: 'tcb' });
  const setRange = (r) => { P.range = r; mem.auto = SR.autoBars(spanDays(hist, r, o.firstBuy)); savePrefs(); mem.view = null; buildChart(null); chart.setFrom(startFor(hist, r, o.firstBuy)); renderBar(); renderBelow(); };
  const lineCount = (o.lines || []).length;
  function renderBar() {
    const typeItems = [['line', 'Line'], ['percent', '%'], ...(fund ? [] : [['candle', 'Candles']])];
    const canTrend = editor && P.mode !== 'percent';
    const left = h('div', { class: 'tcb-l' },
      h('div', { class: 'tcb-row tcb-scroll' }, seg(rangesList.map((r) => [r, r === 'My buy' ? 'My buy' : r]), P.range, setRange, 'Range')),
      h('div', { class: 'tcb-row' }, seg(typeItems, P.mode, (v) => { P.mode = v; if (v === 'percent') { st.tool = null; mem.sel = null; mem.pop = null; } savePrefs(); rebuild(); renderBar(); renderBelow(); }, 'Chart type'),
        lab('Bars'), seg(BARS, P.bars, (v) => { P.bars = v; savePrefs(); rebuild(); renderBar(); renderBelow(); }, 'Bar size')));
    const right = h('div', { class: 'tcb-r' },
      h('div', { class: 'tcb-row' }, lab('Lines'),
        pill('50d', P.ma50, () => { P.ma50 = !P.ma50; savePrefs(); rebuild(); renderBar(); }, colors.ma50, '50-day average'), pill('200d', P.ma200, () => { P.ma200 = !P.ma200; savePrefs(); rebuild(); renderBar(); }, colors.ma200, '200-day average'),
        pill(o.kind === 'share' ? 'RSI' : 'Rolling return', P.ind, () => { P.ind = !P.ind; savePrefs(); rebuild(); renderBar(); }, colors.ind, o.kind === 'share' ? 'Relative strength index (14)' : 'Return over a rolling window'),
        P.ind && o.kind !== 'share' ? seg(WINDOWS, P.win, (v) => { P.win = v; savePrefs(); rebuild(); renderBar(); }, 'Rolling window') : null),
      h('div', { class: 'tcb-row' },
        h('div', { class: 'tcb-seg' }, h('button', { type: 'button', 'aria-label': 'Zoom out', onclick: () => chart.zoom(1.4) }, '−'), h('button', { type: 'button', 'aria-label': 'Zoom in', onclick: () => chart.zoom(0.7) }, '+'), h('button', { type: 'button', onclick: () => { chart.reset(); } }, 'Reset')),
        h('button', { type: 'button', class: 'tcb-pill' + (st.colorsOpen ? ' on' : ''), 'aria-expanded': String(st.colorsOpen), onclick: () => { st.colorsOpen = !st.colorsOpen; renderBar(); renderColors(); } }, 'Colours'),
        canTrend ? h('button', { type: 'button', class: 'tcb-pill' + (st.tool ? ' on' : ''), onclick: () => { st.tool = st.tool ? null : 'trend'; mem.sel = null; mem.pop = null; rebuild(); renderBar(); } }, st.tool ? 'Tap two points…' : 'Trendline') : null,
        editor && (o.lines || []).length && !mem.sel ? h('button', { type: 'button', class: 'tcb-pill', onclick: async () => { if (await confirmDialog(`Remove all ${(o.lines || []).length} trendline${(o.lines || []).length === 1 ? '' : 's'} on ${o.key}?`, 'Remove all')) o.store.clear(); } }, `Clear lines (${(o.lines || []).length})`) : null));
    const fsBtn = h('button', { type: 'button', class: 'tc-fs', 'aria-label': isFull() ? 'Close full view' : 'Full view', title: isFull() ? 'Close (Esc)' : 'Full view', onclick: toggleFull },
      (() => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'ico'); const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', isFull() ? 'M6 6l12 12M18 6L6 18' : 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5'); s.append(p); return s; })());
    bar.replaceChildren(left, right, fsBtn);
  }
  function toggleFull() {
    if (isFull()) { full.open = false; full.key = null; unlock(); } else { full.open = true; full.key = o.key; document.body.classList.add('tc-lock'); try { if (document.documentElement.requestFullscreen) { fsAsked = true; document.documentElement.requestFullscreen().catch(() => { fsAsked = false; }); } } catch { fsAsked = false; } }
    wrap.classList.toggle('full', isFull()); rebuild(); renderBar(); renderBelow();
  }
  document.addEventListener('keydown', function esc(e) { if (!wrap.isConnected) { document.removeEventListener('keydown', esc); return; } if (e.key === 'Escape' && isFull() && !st.tool && !document.querySelector('dialog[open]')) toggleFull(); });

  // ---------- colours panel ----------
  const colorBox = h('div', { class: 'tcb-colors', hidden: true });
  function renderColors() {
    colorBox.hidden = !st.colorsOpen; if (!st.colorsOpen) return;
    const rows = [['ma50', '50-day average'], ['ma200', '200-day average'], ['ind', o.kind === 'share' ? 'RSI' : 'Rolling return'], ...(o.kind === 'share' ? [] : [['median', 'Median (rolling return)']]), ...(o.avgCost > 0 ? [['avg', 'Your average']] : []), ...(fund ? [] : [['up', 'Candle and volume up'], ['down', 'Candle and volume down']])];
    const apply = (k, v) => { colors[k] = v; saveColors(colors); rebuild(); renderColors(); };
    colorBox.replaceChildren(...rows.map(([k, name]) => h('div', { class: 'tcb-crow' },
      h('span', { class: 'tcb-cname' }, h('i', { style: { background: colors[k] } }), name),
      h('span', { class: 'tcb-sw' }, PRESETS.map((c) => h('button', { type: 'button', class: 'sw' + (c.toLowerCase() === colors[k].toLowerCase() ? ' on' : ''), style: { background: c }, 'aria-label': 'Use ' + c + ' for ' + name, onclick: () => apply(k, c) })),
        h('input', { type: 'color', value: colors[k], 'aria-label': 'Pick any colour for ' + name, onchange: (e) => apply(k, e.target.value) })))),
      h('div', { class: 'tcb-cfoot' }, h('button', { type: 'button', class: 'small', disabled: !colorsChanged(), onclick: () => { try { localStorage.removeItem('tl.chart.colors'); } catch { /* ignore */ } Object.assign(colors, DEFAULT_COLORS); rebuild(); renderColors(); } }, 'Reset to default'),
        h('span', { class: 'note' }, 'Kept on this device only. Trendline colours are chosen per line: tap a line.')));
  }

  // ---------- trendline pop-up ----------
  const pop = h('div', { class: 'tc-pop', hidden: true });
  function renderPop() {
    const line = mem.sel && (o.lines || []).find((l) => l.id === mem.sel);
    if (!editor || !line || !mem.pop) { pop.hidden = true; if (pop.parentNode) pop.remove(); return; }
    const rect = holder.getBoundingClientRect(), wpx = rect.width || 320, hpx = rect.height || 300, left = mem.pop.mx != null ? (mem.pop.mx > wpx / 2 ? 4 : Math.max(4, wpx - 216)) : Math.max(4, Math.min(wpx - 218, mem.pop.cx - 106)), topPx = mem.pop.my != null ? (mem.pop.my < hpx / 2 ? Math.max(4, hpx - 120) : 4) : 4;   // in the corner away from the line's middle, so the line can still be dragged
    pop.style.left = left + 'px'; pop.style.top = topPx + 'px'; pop.hidden = false;
    pop.replaceChildren(h('div', { class: 'tc-pop-sw' }, TL_COLORS.map((c, i) => h('button', { type: 'button', class: 'sw' + ((line.color || TL_COLORS[0]) === c ? ' on' : ''), style: { background: c }, title: TL_NAMES[i], 'aria-label': TL_NAMES[i], onclick: () => { P.newColor = c; savePrefs(); o.store.update(line.id, { color: c }); } }))),
      h('div', { class: 'tc-pop-act' }, h('button', { type: 'button', class: 'small', onclick: () => alertDialog(line) }, line.alert ? 'Edit alert' : 'Set alert'), h('button', { type: 'button', class: 'small danger', onclick: () => { mem.sel = null; mem.pop = null; o.store.remove(line.id); } }, 'Delete')));
    if (!pop.parentNode) holder.append(pop);
  }
  function alertDialog(line) {
    const dir = selectOf([{ value: 'above', label: 'closes above the line' }, { value: 'below', label: 'closes below the line' }], line.alert ? line.alert.dir : 'above');
    const size = selectOf([{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }], line.alert ? line.alert.bar : 'day');
    dialog('Trendline alert', h('div', null, field('Alert when a candle', dir), field('Candle size', size),
      h('p', { class: 'note' }, 'It fires when a finished candle closes beyond the line. A week or month counts only once it is complete, and candles from before today do not count. It is checked against price data already saved on this device, so reload the chart to bring it up to date.')),
      [{ label: 'Save alert', class: 'primary', onclick: (close) => { close(); o.store.update(line.id, { alert: { dir: dir.value, bar: size.value, since: o.today } }); } },
        ...(line.alert ? [{ label: 'Remove alert', class: 'danger', onclick: (close) => { close(); o.store.update(line.id, { alert: null }); } }] : []), { label: 'Cancel', onclick: (close) => close() }]);
  }

  // ---------- below the chart ----------
  const below = h('div', { class: 'tc-below' });
  function renderBelow() {
    if (isFull()) { below.replaceChildren(); return; }
    const ret = SR.periodReturns(hist.d, hist.c).filter((r) => ['1M', '3M', '6M', '1Y', '3Y', '5Y'].includes(r.label) && r.value != null), b = barsMode();
    const markers = (o.trades || []).length;
    below.replaceChildren(...[
      ret.length ? h('div', { class: 'sp-rets' }, ret.map((r) => h('span', null, h('small', null, r.label + (r.annual ? ' p.a.' : '')), chg(r.value, 1)))) : null,
      h('div', { class: 'tc-chips' },
        o.avgCost > 0 ? h('span', { class: 'tc-chip2' }, h('i', { class: 'dash', style: { borderColor: colors.avg } }), 'Your average ₹' + dec(o.avgCost, 2)) : null,
        editor || (o.lines || []).length ? h('span', { class: 'tc-chip2' }, h('i', { class: 'line', style: { background: P.newColor } }), (o.lines || []).length + ' trendline' + ((o.lines || []).length === 1 ? '' : 's')) : null,
        markers ? h('span', { class: 'tc-chip2' }, h('b', { class: 'pos' }, '▲'), ' buy ', h('b', { class: 'neg' }, '▼'), ' sell') : null),
      h('p', { class: 'note' }, 'Scroll or pinch to zoom, drag to move, drag the right edge or the date line to stretch. Double-click an edge to undo. ' + (b !== 'day' ? `Each candle is a ${b}. ` : '') + (fund ? 'Funds show one NAV a day, so there are no candles or trendlines. ' : '')),
      o.note ? h('p', { class: 'note' }, o.note) : null].filter(Boolean));
  }

  wrap.classList.toggle('full', isFull());
  wrap.append(bar, colorBox, holder, below);
  renderBar(); renderColors(); buildChart(mem.view);
  if (!mem.view) { chart.setFrom(startFor(hist, P.range, o.firstBuy)); }
  renderBelow();
  if (isFull()) document.body.classList.add('tc-lock');
  return wrap;
}
