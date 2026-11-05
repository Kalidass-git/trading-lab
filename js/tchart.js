// Trading Lab: a trading-terminal style chart in plain SVG (no library). Draws price (line, percent or candles), up to two averages, an optional
// indicator panel and volume, with a right-hand price axis, a round-number grid, year/month lines, price tags, a crosshair, zoom and pan by wheel,
// drag, pinch and axis drags, free panning past both ends, and trendlines. The page around it (chartkit.js) owns the toolbar and the saving.
// x is the bar number (not the date), so weekends do not leave gaps. The visible window is kept as two day numbers so it survives a redraw.
import { dayNo, fromDayNo } from './lab/series.js';

const NS = 'http://www.w3.org/2000/svg';
const S = (tag, a = {}, ...kids) => { const el = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(a || {})) if (v != null && v !== false) el.setAttribute(k, v); for (const k of kids.flat()) if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(String(k))); return el; };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const TL_COLORS = ['#00b8d4', '#e91e63', '#ffb300', '#43a047', '#78909c', '#fb8c00'];
export const TL_NAMES = ['Cyan', 'Pink', 'Amber', 'Green', 'Slate', 'Orange'];
export const UP = '#089981';
export const DOWN = '#f23645';
let uid = 0;

/** Round-number steps (1, 2, 2.5, 5 or 10 times a power of ten), about one line per `px` pixels. Returns [{ v, major }]. */
export function niceTicks(lo, hi, heightPx, px = 38) {
  const want = Math.max(2, heightPx / px), raw = (hi - lo) / want;
  if (!(raw > 0) || !isFinite(raw)) return [];
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || 10 * mag;
  const out = [];
  for (let k = Math.ceil(lo / step - 1e-9); k * step <= hi + 1e-9; k++) out.push({ v: Math.round(k * step * 1e8) / 1e8, major: k % 2 === 0, step });
  return out;
}
const decimalsFor = (step) => (step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(step) - 1e-9)));
const inr = (v, d = 2) => Number(v).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
const compactVol = (v) => { const x = v * 1000; return x >= 1e7 ? (x / 1e7).toFixed(2) + ' Cr' : x >= 1e5 ? (x / 1e5).toFixed(2) + ' L' : x >= 1e3 ? (x / 1e3).toFixed(1) + ' K' : String(Math.round(x)); };
export const fmtDateDefault = (iso) => `${Number(iso.slice(8, 10))} ${MON[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

/**
 * Vertical grid candidates for a visible time window [t1, t2] (day numbers). Returns [{ t, label, rank }] with rank 3 for years, 2 for
 * months and quarters, 1 for Mondays. Longer than 3 years: years and July. 14 months to 3 years: years and quarters. Under about 130 days: Mondays.
 */
export function timeMarks(t1, t2) {
  const span = t2 - t1, out = [], d1 = fromDayNo(Math.floor(t1)), y1 = Number(d1.slice(0, 4)), y2 = Number(fromDayNo(Math.ceil(t2)).slice(0, 4));
  const first = (y, m) => dayNo(`${y}-${String(m).padStart(2, '0')}-01`);
  for (let y = y1; y <= y2 + 1; y++) {
    for (let m = 1; m <= 12; m++) {
      const t = first(y, m); if (t < t1 || t > t2) continue;
      if (m === 1) out.push({ t, label: String(y), rank: 3 });
      else if (span > 1095) { if (m === 7) out.push({ t, label: 'Jul', rank: 2 }); }
      else if (span > 425) { if (m % 3 === 1) out.push({ t, label: MON[m - 1], rank: 2 }); }
      else out.push({ t, label: MON[m - 1], rank: 2 });
    }
  }
  if (span < 130) for (let t = Math.ceil(t1); t <= t2; t++) if ((t + 3) % 7 === 0 && !out.some((o) => o.t === t)) out.push({ t, label: String(Number(fromDayNo(t).slice(8, 10))), rank: 1 });
  return out;
}
/** Keeps the most important marks that are at least `gap` apart; years beat months, months beat days. */
export function placeMarks(marks, xOf, gap, left, right) {
  const ok = [], xs = [];
  for (const m of [...marks].sort((a, b) => b.rank - a.rank || a.t - b.t)) {
    const x = xOf(m.t); if (x < left || x > right || xs.some((q) => Math.abs(q - x) < gap)) continue;
    ok.push({ ...m, x }); xs.push(x);
  }
  return ok.sort((a, b) => a.t - b.t);
}

/**
 * o: { hist (rows + .mode), mode: 'line'|'percent'|'candle', colors: {up, down}, lines: [{ key, name, color, values, width, dash }], panel: { label, values, color, fmt, median, zero } | null,
 *      avgCost, trades: [{ date, side }], trend: [{ id, d1, p1, d2, p2, color }], tool: 'trend' | null, newColor, selected, canEdit, width, height, view: { t1, t2 } | null,
 *      fmtPrice, fmtDate, onView(view), onLine(event), onTool(tool) }
 * Returns { el, zoom(factor), reset(), setFrom(isoDate), zoomed(), view() }.
 */
export function tchart(o) {
  const hist = o.hist, n = hist.d.length, el = document.createElement('div');
  el.className = 'tc';
  if (n < 2) { el.append(Object.assign(document.createElement('p'), { className: 'tc-msg', textContent: 'Not enough data for a chart here. Pick a longer range or load more history.' })); return { el, zoom() {}, reset() {}, setFrom() {}, zoomed: () => false, view: () => null }; }
  const W = o.width || 380, H1 = o.height || 230, phone = W < 600, PL = 6, R = phone ? 56 : 64, PW = W - PL - R, GAP = 8, AX = 24;
  const up = (o.colors && o.colors.up) || UP, down = (o.colors && o.colors.down) || DOWN, mode = o.mode || 'line';
  const fmtP = o.fmtPrice || ((v) => inr(v, 2)), fmtD = o.fmtDate || fmtDateDefault;
  const hasPanel = !!(o.panel && o.panel.values && o.panel.values.some((v) => v != null)), hasVol = mode !== 'percent' && hist.v.some((v) => v > 0);
  const HP = hasPanel ? 66 : 0, HV = hasVol ? 44 : 0, top1 = 6, topP = top1 + H1 + GAP, topV = topP + (hasPanel ? HP + GAP : 0), plotEnd = (hasVol ? topV + HV : hasPanel ? topP + HP : top1 + H1), TH = plotEnd + AX;
  const T = hist.d.map(dayNo), avg = Math.max(0.25, (T[n - 1] - T[0]) / (n - 1)), clipId = 'tcc' + (++uid);
  const posOfT = (t) => { if (t <= T[0]) return 0.5 + (t - T[0]) / avg; if (t >= T[n - 1]) return n - 0.5 + (t - T[n - 1]) / avg; let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] <= t) lo = m; else hi = m; } return lo + 0.5 + (t - T[lo]) / (T[lo + 1] - T[lo] || 1); };
  const tOfPos = (p) => { if (p <= 0.5) return T[0] + (p - 0.5) * avg; if (p >= n - 0.5) return T[n - 1] + (p - (n - 0.5)) * avg; const i = Math.min(n - 2, Math.floor(p - 0.5)); return T[i] + (p - 0.5 - i) * (T[i + 1] - T[i]); };
  let a = 0, b = n, yr = null, cross = null, drag = null, draft = null, selected = o.selected || null, tool = o.tool || null;
  const minSpan = Math.min(12, n), maxSpan = n * 1.25 + 1;
  const set = (a2, b2) => { const span = Math.min(Math.max(b2 - a2, minSpan), maxSpan), mid = (a2 + b2) / 2; a2 = mid - span / 2; b2 = mid + span / 2; if (a2 < -span / 2) { a2 = -span / 2; b2 = a2 + span; } if (b2 > n + span / 2) { b2 = n + span / 2; a2 = b2 - span; } a = a2; b = b2; };
  if (o.view && o.view.t1 != null && o.view.t2 != null) set(posOfT(o.view.t1), posOfT(o.view.t2));
  const reportView = () => o.onView && o.onView({ t1: tOfPos(a), t2: tOfPos(b), yr });
  if (o.view && o.view.yr && mode !== 'percent') yr = o.view.yr;
  const x = (p) => PL + ((p - a) / (b - a)) * PW, inv = (X) => a + ((X - PL) / PW) * (b - a);
  const lines = () => (o.trend || []).map((l) => (drag && drag.line && drag.line.id === l.id ? drag.line : l));

  // ---------- what is on screen ----------
  const vis = () => { const i0 = Math.max(0, Math.ceil(a - 0.5)), i1 = Math.min(n - 1, Math.floor(b - 0.5)); return i0 <= i1 ? [i0, i1] : [Math.max(0, Math.min(n - 1, Math.round(a))), Math.max(0, Math.min(n - 1, Math.round(a)))]; };
  const geom = () => {
    const [i0, i1] = vis(), pct = mode === 'percent', base = pct ? hist.c[i0] : 0, val = (v) => (pct ? (v / base - 1) * 100 : v);
    let lo = Infinity, hi = -Infinity;
    for (let i = i0; i <= i1; i++) { const l = mode === 'candle' ? hist.l[i] : hist.c[i], h = mode === 'candle' ? hist.h[i] : hist.c[i]; lo = Math.min(lo, val(l)); hi = Math.max(hi, val(h)); }
    const pad = (hi - lo) * 0.06 || Math.abs(hi) * 0.01 || 1;
    let plo = lo - pad, phi = hi + pad;
    if (yr) { plo = yr.lo; phi = yr.hi; }
    return { i0, i1, pct, base, val, lo, hi, plo, phi, y: (v) => top1 + ((phi - v) / (phi - plo)) * H1, vOfY: (Y) => phi - ((Y - top1) / H1) * (phi - plo) };
  };
  const priceLabel = (g, v, step) => (g.pct ? (v > 0 ? '+' : '') + v.toFixed(step < 1 ? 1 : 0) + '%' : step >= 1 ? inr(v, 0) : inr(v, decimalsFor(step)));
  const tag = (X, Y, w, h, fill, stroke, text, tc, anchor = 'start', fs = 11) => S('g', null, S('rect', { x: X, y: Y - h / 2, width: w, height: h, rx: 2.5, fill, stroke: stroke || 'none', 'stroke-width': 1 }), S('text', { x: anchor === 'middle' ? X + w / 2 : X + 4, y: Y + 4, 'text-anchor': anchor, 'font-size': fs, fill: tc, 'font-weight': 600 }, text));

  // ---------- drawing ----------
  const box = document.createElement('div'); box.className = 'tc-box';
  const readout = document.createElement('div'); readout.className = 'tc-read';
  el.append(box, readout);
  let svgEl = null, xh = null, G = null;

  function draw() {
    G = geom();
    const g = G, [i0, i1] = [Math.max(0, Math.floor(a - 0.5) - 1), Math.min(n - 1, Math.ceil(b - 0.5) + 1)], barW = PW / (b - a);
    const root = S('svg', { viewBox: `0 0 ${W} ${TH}`, width: '100%', class: 'tc-svg', role: 'img', 'aria-label': 'Price chart', 'font-family': 'inherit' });
    const defs = S('defs', null, S('clipPath', { id: clipId }, S('rect', { x: PL, y: 0, width: PW, height: TH })), S('clipPath', { id: clipId + 'p' }, S('rect', { x: PL, y: top1, width: PW, height: H1 })));
    root.append(defs);
    const gridG = S('g', { 'shape-rendering': 'crispEdges' }), body = S('g', { 'clip-path': `url(#${clipId}p)` }), over = S('g');
    // vertical time grid
    const marks = placeMarks(timeMarks(tOfPos(a), tOfPos(b)), (t) => x(posOfT(t)), phone ? 46 : 58, PL, PL + PW);
    for (const m of marks) { const X = Math.round(x(posOfT(m.t))) + 0.5; gridG.append(S('line', { x1: X, x2: X, y1: top1, y2: plotEnd, stroke: 'var(--tc-grid)', 'stroke-width': 1 })); root.append(S('text', { x: X, y: plotEnd + 15, 'text-anchor': 'middle', 'font-size': 11, fill: 'var(--muted)', 'font-weight': m.rank === 3 ? 700 : 400, 'data-mark': m.label }, m.label)); }
    // horizontal price grid
    const ticks = niceTicks(g.plo, g.phi, H1);
    for (const tk of ticks) { const Y = Math.round(g.y(tk.v)) + 0.5; gridG.append(S('line', { x1: PL, x2: PL + PW, y1: Y, y2: Y, stroke: 'var(--tc-grid)', 'stroke-width': 1 })); root.append(S('text', { x: PL + PW + 5, y: Y + 4, 'font-size': 11, fill: tk.major ? 'var(--ink)' : 'var(--muted)', 'font-weight': tk.major ? 700 : 400 }, priceLabel(g, tk.v, tk.step))); }
    // panel frames
    const frame = (y0, h) => { gridG.append(S('line', { x1: PL, x2: PL + PW, y1: y0 + 0.5, y2: y0 + 0.5, stroke: 'var(--line)', 'stroke-width': 1 }), S('line', { x1: PL, x2: PL + PW, y1: y0 + h + 0.5, y2: y0 + h + 0.5, stroke: 'var(--line)', 'stroke-width': 1 })); };
    if (hasPanel) frame(topP, HP); if (hasVol) frame(topV, HV);
    root.append(gridG, body, over);

    // price series
    const px = (i) => x(i + 0.5), vv = (i) => g.val(hist.c[i]);
    const last = n - 1, endUp = hist.c[Math.min(n - 1, g.i1)] >= hist.c[g.i0], lineCol = endUp ? up : down;
    if (mode === 'candle') {
      const bw = Math.min(14, barW * 0.7), pu = [], pd = [], wu = [], wd = [];
      for (let i = i0; i <= i1; i++) {
        const X = px(i), o_ = hist.o[i], c_ = hist.c[i], hi = g.y(hist.h[i]), lo = g.y(hist.l[i]), yo = g.y(o_), yc = g.y(c_), isUp = c_ >= o_, top = Math.min(yo, yc), bh = Math.max(1, Math.abs(yo - yc));
        (isUp ? wu : wd).push(`M${X.toFixed(1)} ${hi.toFixed(1)}V${lo.toFixed(1)}`);
        (isUp ? pu : pd).push(`M${(X - bw / 2).toFixed(1)} ${top.toFixed(1)}h${bw.toFixed(1)}v${bh.toFixed(1)}h${(-bw).toFixed(1)}z`);
      }
      body.append(S('path', { d: wu.join(''), stroke: up, 'stroke-width': 1, fill: 'none' }), S('path', { d: wd.join(''), stroke: down, 'stroke-width': 1, fill: 'none' }), S('path', { d: pu.join(''), fill: up }), S('path', { d: pd.join(''), fill: down }));
    } else {
      const pts = []; for (let i = i0; i <= i1; i++) pts.push(`${px(i).toFixed(1)} ${g.y(vv(i)).toFixed(1)}`);
      body.append(S('path', { d: `M${pts.join('L')}L${px(i1).toFixed(1)} ${top1 + H1}L${px(i0).toFixed(1)} ${top1 + H1}Z`, fill: lineCol, opacity: 0.08 }), S('path', { d: 'M' + pts.join('L'), fill: 'none', stroke: lineCol, 'stroke-width': 1.6, 'stroke-linejoin': 'round' }));
    }
    // averages
    for (const ln of (o.lines || [])) {
      if (mode === 'percent' && ln.noPercent) continue;
      const seg = []; for (let i = i0; i <= i1; i++) if (ln.values[i] != null) seg.push(`${seg.length ? 'L' : 'M'}${px(i).toFixed(1)} ${g.y(g.val(ln.values[i])).toFixed(1)}`);
      if (seg.length > 1) body.append(S('path', { d: seg.join(''), fill: 'none', stroke: ln.color, 'stroke-width': ln.width || 2.2, 'stroke-dasharray': ln.dash || null, 'stroke-linejoin': 'round' }));
    }
    // average cost, markers
    if (o.avgCost > 0 && mode !== 'percent') { const Y = g.y(o.avgCost); if (Y > top1 && Y < top1 + H1) body.append(S('line', { x1: PL, x2: PL + PW, y1: Y, y2: Y, stroke: o.avgColor || '#b08900', 'stroke-width': 1.4, 'stroke-dasharray': '6 4' }), S('text', { x: PL + 4, y: Y - 4, 'font-size': 10.5, fill: o.avgColor || '#b08900', 'font-weight': 600 }, 'Your average')); }
    if (mode !== 'percent') for (const t of (o.trades || [])) {
      let i = hist.d.findIndex((d) => d >= t.date); if (i < 0 || (i === n - 1 && hist.d[n - 1] < t.date)) continue;
      const X = px(i); if (X < PL - 8 || X > PL + PW + 8) continue;
      if (t.side === 'buy') { const Y = g.y(hist.l[i]) + 5; body.append(S('path', { d: `M${X} ${Y}l-4.5 8h9z`, fill: 'var(--pos)' })); } else { const Y = g.y(hist.h[i]) - 5; body.append(S('path', { d: `M${X} ${Y}l-4.5 -8h9z`, fill: 'var(--neg)' })); }
    }
    // trendlines
    const lineXY = (l) => [x(posOfT(dayNo(l.d1))), g.y(l.p1), x(posOfT(dayNo(l.d2))), g.y(l.p2)];
    if (mode !== 'percent') {
      for (const l of lines()) {
        const [x1, y1, x2, y2] = lineXY(l), sel = l.id === selected, col = l.color || TL_COLORS[0];
        let ax = PL - 400, bx = PL + PW + 400, ay = y1, by = y2;
        if (Math.abs(x2 - x1) > 0.01) { const m = (y2 - y1) / (x2 - x1); ay = y1 + m * (ax - x1); by = y1 + m * (bx - x1); } else { ax = x1; bx = x1; ay = top1 - 400; by = top1 + H1 + 400; }
        body.append(S('line', { x1: ax, y1: ay, x2: bx, y2: by, stroke: col, 'stroke-width': sel ? 2.8 : 1.6, 'stroke-linecap': 'round', 'data-line': l.id }));
        if (sel) over.append(S('circle', { cx: x1, cy: y1, r: 5, fill: 'var(--surface)', stroke: col, 'stroke-width': 2 }), S('circle', { cx: x2, cy: y2, r: 5, fill: 'var(--surface)', stroke: col, 'stroke-width': 2 }));
      }
      if (draft) { const px1 = x(posOfT(dayNo(draft.d1))), py1 = g.y(draft.p1); over.append(S('circle', { cx: px1, cy: py1, r: 4.5, fill: o.newColor || TL_COLORS[0] })); if (draft.to) body.append(S('line', { x1: px1, y1: py1, x2: draft.to.X, y2: draft.to.Y, stroke: o.newColor || TL_COLORS[0], 'stroke-width': 1.6, 'stroke-dasharray': '4 3' })); }
    }
    // indicator panel
    let pm = null;
    if (hasPanel) {
      const vals = o.panel.values; let lo = Infinity, hi = -Infinity; for (let i = g.i0; i <= g.i1; i++) if (vals[i] != null) { lo = Math.min(lo, vals[i]); hi = Math.max(hi, vals[i]); }
      if (!isFinite(lo)) { lo = 0; hi = 1; } if (o.panel.zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); } const pd = (hi - lo) * 0.1 || 1; lo -= pd; hi += pd;
      const py = (v) => topP + ((hi - v) / (hi - lo)) * HP, fmtv = o.panel.fmt || ((v) => v.toFixed(1)), pcl = S('clipPath', { id: clipId + 'i' }, S('rect', { x: PL, y: topP, width: PW, height: HP })); defs.append(pcl);
      const grp = S('g', { 'clip-path': `url(#${clipId}i)` }), seg = []; for (let i = i0; i <= i1; i++) if (vals[i] != null) seg.push(`${seg.length ? 'L' : 'M'}${px(i).toFixed(1)} ${py(vals[i]).toFixed(1)}`);
      if (o.panel.zero && lo < 0 && hi > 0) grp.append(S('line', { x1: PL, x2: PL + PW, y1: py(0), y2: py(0), stroke: 'var(--muted)', 'stroke-width': 1, opacity: 0.6 }));
      const vis_ = []; for (let i = g.i0; i <= g.i1; i++) if (vals[i] != null) vis_.push(vals[i]); vis_.sort((p, q) => p - q);
      if (o.panel.median && vis_.length > 2) { const md = vis_[Math.floor(vis_.length / 2)], Y = py(md); grp.append(S('line', { x1: PL, x2: PL + PW, y1: Y, y2: Y, stroke: o.medianColor || '#e91e63', 'stroke-width': 1.2, 'stroke-dasharray': '5 4' }), S('text', { x: PL + PW - 4, y: Y - 3, 'text-anchor': 'end', 'font-size': 10, fill: o.medianColor || '#e91e63' }, 'Median ' + fmtv(md))); }
      if (seg.length > 1) grp.append(S('path', { d: seg.join(''), fill: 'none', stroke: o.panel.color, 'stroke-width': 2.2, 'stroke-linejoin': 'round' }));
      root.append(grp, S('text', { x: PL + 4, y: topP + 12, 'font-size': 11, 'font-weight': 700, fill: o.panel.color }, o.panel.label), S('text', { x: PL + PW + 5, y: topP + 10, 'font-size': 10, fill: 'var(--muted)' }, fmtv(hi - pd)), S('text', { x: PL + PW + 5, y: topP + HP - 2, 'font-size': 10, fill: 'var(--muted)' }, fmtv(lo + pd)));
      pm = { py, vals };
    }
    // volume
    if (hasVol) {
      let mx = 1; for (let i = g.i0; i <= g.i1; i++) mx = Math.max(mx, hist.v[i] || 0);
      const vu = [], vd = [], bw = Math.max(0.6, Math.min(14, barW * 0.7));
      for (let i = i0; i <= i1; i++) { const h = ((hist.v[i] || 0) / mx) * (HV - 4), X = px(i), seg = `M${(X - bw / 2).toFixed(1)} ${(topV + HV - h).toFixed(1)}h${bw.toFixed(1)}v${h.toFixed(1)}h${(-bw).toFixed(1)}z`; (i === 0 || hist.c[i] >= hist.c[i - 1] ? vu : vd).push(seg); }
      const vcl = S('clipPath', { id: clipId + 'v' }, S('rect', { x: PL, y: topV, width: PW, height: HV })); defs.append(vcl);
      root.append(S('g', { 'clip-path': `url(#${clipId}v)`, opacity: 0.4 }, S('path', { d: vu.join(''), fill: up }), S('path', { d: vd.join(''), fill: down })), S('text', { x: PL + 4, y: topV + 12, 'font-size': 10, fill: 'var(--muted)' }, 'Volume'));
    }
    // right-axis tags: last price, high, low
    const lastX = px(last), showLast = lastX >= PL && lastX <= PL + PW + 1, lastV = g.val(hist.c[last]), lastY = g.y(lastV), lastUp = hist.c[last] >= (hist.c[last - 1] ?? hist.c[last]);
    const lastTxt = g.pct ? (lastV > 0 ? '+' : '') + lastV.toFixed(2) + '%' : fmtP(hist.c[last]);
    if (showLast && lastY > top1 && lastY < top1 + H1) {
      over.append(S('line', { x1: PL, x2: PL + PW, y1: lastY, y2: lastY, stroke: lastUp ? up : down, 'stroke-width': 1, 'stroke-dasharray': '1.5 3', 'data-tag': 'last' }), tag(PL + PW + 1, lastY, R - 2, 17, lastUp ? up : down, null, lastTxt, '#fff'));
    }
    const hiV = g.hi, loV = g.lo, hiY = g.y(hiV), loY = g.y(loV);
    const near = (Y) => showLast && Math.abs(Y - lastY) < 20;
    const tagTxt = (v) => (g.pct ? (v > 0 ? '+' : '') + v.toFixed(1) + '%' : fmtP(v));
    if (!yr && !near(hiY)) over.append(S('text', { x: PL + PW - 3, y: hiY + 4, 'text-anchor': 'end', 'font-size': 10, fill: 'var(--muted)' }, 'High'), tag(PL + PW + 1, hiY, R - 2, 17, 'var(--tc-tag)', null, tagTxt(hiV), 'var(--ink)'));
    if (!yr && !near(loY) && Math.abs(loY - hiY) > 20) over.append(S('text', { x: PL + PW - 3, y: loY + 4, 'text-anchor': 'end', 'font-size': 10, fill: 'var(--muted)' }, 'Low'), tag(PL + PW + 1, loY, R - 2, 17, 'var(--tc-tag)', null, tagTxt(loV), 'var(--ink)'));
    xh = S('g', { class: 'tc-xh', 'pointer-events': 'none' }); root.append(xh);
    box.replaceChildren(root); svgEl = root; svgEl.__pm = pm;
    box.style.touchAction = selected || tool ? 'none' : 'pan-y';
    drawCross();
  }

  // ---------- crosshair and readout ----------
  function readoutFor(i) {
    const c = hist.c[i], pc = i > 0 ? hist.c[i - 1] : null, ch = pc > 0 ? c / pc - 1 : null, r = readout; r.replaceChildren();
    const sp = (cls, txt) => { const e = document.createElement('span'); if (cls) e.className = cls; e.textContent = txt; return e; };
    r.append(sp('tc-d', fmtD(hist.d[i]) + (hist.mode && hist.mode !== 'day' ? ' (' + hist.mode + ')' : '')));
    if (mode === 'candle') r.append(sp('', 'O ' + fmtP(hist.o[i])), sp('', 'H ' + fmtP(hist.h[i])), sp('', 'L ' + fmtP(hist.l[i])), sp('', 'C ' + fmtP(c))); else r.append(sp('', (o.priceLabel || 'Close') + ' ' + fmtP(c)));
    if (ch != null) r.append(sp(ch >= 0 ? 'pos' : 'neg', (ch >= 0 ? '▲ +' : '▼ ') + (ch * 100).toFixed(2) + '%'));
    if (hasVol && hist.v[i] > 0) r.append(sp('muted', 'Vol ' + compactVol(hist.v[i])));
    for (const ln of (o.lines || [])) if (ln.values[i] != null) { const chip = sp('tc-chip', ''); chip.append(Object.assign(document.createElement('i'), { style: `background:${ln.color}` }), document.createTextNode(`${ln.name} ${ln.fmt ? ln.fmt(ln.values[i]) : fmtP(ln.values[i])}`)); r.append(chip); }
    if (hasPanel && o.panel.values[i] != null) { const chip = sp('tc-chip', ''); chip.append(Object.assign(document.createElement('i'), { style: `background:${o.panel.color}` }), document.createTextNode(`${o.panel.label} ${(o.panel.fmt || ((v) => v.toFixed(1)))(o.panel.values[i])}`)); r.append(chip); }
  }
  function drawCross() {
    if (!xh) return;
    xh.replaceChildren();
    if (!cross) { readoutFor(n - 1); return; }
    const g = G, i = Math.max(0, Math.min(n - 1, Math.round(cross.pos - 0.5))), X = x(i + 0.5);
    if (X < PL || X > PL + PW) { readoutFor(n - 1); return; }
    readoutFor(i);
    const isUp = hist.c[i] >= (hist.c[i - 1] ?? hist.c[i]), col = isUp ? up : down;
    xh.append(S('line', { x1: X, x2: X, y1: top1, y2: plotEnd, stroke: 'var(--muted)', 'stroke-width': 1, 'stroke-dasharray': '4 3' }));
    const dots = [[g.y(g.val(hist.c[i])), mode === 'candle' ? col : isUp ? up : down]];
    for (const ln of (o.lines || [])) if (ln.values[i] != null && !(mode === 'percent' && ln.noPercent)) dots.push([g.y(g.val(ln.values[i])), ln.color]);
    for (const [Y, c] of dots) if (Y >= top1 && Y <= top1 + H1) xh.append(S('circle', { cx: X, cy: Y, r: 3.5, fill: c, stroke: 'var(--surface)', 'stroke-width': 1.5 }));
    if (hasPanel && svgEl.__pm && o.panel.values[i] != null) xh.append(S('circle', { cx: X, cy: svgEl.__pm.py(o.panel.values[i]), r: 3.5, fill: o.panel.color, stroke: 'var(--surface)', 'stroke-width': 1.5 }));
    if (cross.Y != null && cross.Y >= top1 && cross.Y <= top1 + H1) {
      const v = g.vOfY(cross.Y);
      xh.append(S('line', { x1: PL, x2: PL + PW, y1: cross.Y, y2: cross.Y, stroke: 'var(--muted)', 'stroke-width': 1, 'stroke-dasharray': '4 3' }), tag(PL + PW + 1, cross.Y, R - 2, 17, 'var(--surface)', col, g.pct ? (v > 0 ? '+' : '') + v.toFixed(2) + '%' : fmtP(v), col));
    }
    const lbl = fmtD(hist.d[i]), tw = lbl.length * 6 + 12, tx = Math.max(PL, Math.min(PL + PW - tw, X - tw / 2));
    xh.append(tag(tx, plotEnd + 11, tw, 17, 'var(--ink)', null, lbl, 'var(--surface)', 'middle'));
  }

  // ---------- zoom and pan ----------
  const commit = (redraw = true) => { if (redraw) draw(); reportView(); };
  const zoomAt = (X, f) => { const p = inv(X), na = p - (p - a) * f, nb = p + (b - p) * f; set(na, nb); commit(); };
  const panBy = (dp) => { set(a + dp, b + dp); commit(); };
  const api = {
    el,
    zoom: (f) => { const mid = (a + b) / 2; set(mid - ((b - a) * f) / 2, mid + ((b - a) * f) / 2); commit(); },
    reset: () => { a = 0; b = n; yr = null; draw(); reportView(); },
    setFrom: (iso) => { if (!iso) { a = 0; b = n; } else { const p = Math.max(0, posOfT(dayNo(iso)) - 0.5); set(p, n + 0.5); } yr = null; draw(); reportView(); },
    zoomed: () => Math.abs(a) > 1e-6 || Math.abs(b - n) > 1e-6 || !!yr,
    view: () => ({ t1: tOfPos(a), t2: tOfPos(b), yr }),
    cancelDraft: () => { draft = null; draw(); },
    select: (id) => { selected = id; draw(); },
  };

  // ---------- pointer handling ----------
  const loc = (e) => { const r = box.getBoundingClientRect(), k = W / (r.width || W); return { X: (e.clientX - r.left) * k, Y: (e.clientY - r.top) * k, k, cx: e.clientX - r.left, cy: e.clientY - r.top }; };
  const region = (p) => (p.Y > plotEnd ? 'time' : p.X > PL + PW ? (p.Y >= top1 && p.Y <= top1 + H1 && mode !== 'percent' ? 'price' : 'axis') : 'plot');
  const dist = (l, p, g) => { const x1 = x(posOfT(dayNo(l.d1))), y1 = g.y(l.p1), x2 = x(posOfT(dayNo(l.d2))), y2 = g.y(l.p2), dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy); if (len < 1e-6) return Math.hypot(p.X - x1, p.Y - y1); return Math.abs(dy * (p.X - x1) - dx * (p.Y - y1)) / len; };
  const midOf = (l, p) => { const g = G; return { mx: (x(posOfT(dayNo(l.d1))) + x(posOfT(dayNo(l.d2)))) / 2 / p.k, my: (g.y(l.p1) + g.y(l.p2)) / 2 / p.k }; };
  const hitLine = (p) => { if (mode === 'percent' || !o.trend || !o.trend.length || p.Y > top1 + H1 || p.Y < top1) return null; const g = G; let best = null, bd = 12 * p.k; for (const l of lines()) { const d = dist(l, p, g); if (d <= bd) { best = l; bd = d; } } return best; };
  const hitHandle = (l, p) => { const g = G, pts = [[x(posOfT(dayNo(l.d1))), g.y(l.p1), 1], [x(posOfT(dayNo(l.d2))), g.y(l.p2), 2]]; for (const [hx, hy, w] of pts) if (Math.hypot(p.X - hx, p.Y - hy) <= 14 * p.k) return w; return 0; };
  const snap = (p) => {
    const g = G, pos = inv(p.X), i = Math.round(pos - 0.5);
    if (i >= 0 && i < n) { const cand = mode === 'candle' ? [hist.o[i], hist.h[i], hist.l[i], hist.c[i]] : [hist.c[i]]; let best = null, bd = 12 * p.k; for (const c of cand) { const d = Math.abs(g.y(c) - p.Y); if (d <= bd) { bd = d; best = c; } } if (best != null) return { d: hist.d[i], p: best }; }
    return { d: fromDayNo(Math.round(tOfPos(pos))), p: g.vOfY(p.Y) };
  };
  const pts = new Map(); let gest = null, pinch = null, timer = null;
  const setCross = (p) => { cross = { pos: inv(p.X), Y: p.Y }; drawCross(); };
  const clearCross = () => { cross = null; drawCross(); };
  const finishTap = (p, e) => {
    const r = region(p); if (r !== 'plot') return;
    if (tool === 'trend' && o.canEdit && mode !== 'percent') {
      const s = snap(p);
      if (!draft) { draft = { d1: s.d, p1: s.p }; draw(); return; }
      const ln = { d1: draft.d1, p1: draft.p1, d2: s.d, p2: s.p }; draft = null; tool = null;
      o.onLine && o.onLine({ type: 'add', line: ln }); o.onTool && o.onTool(null); draw(); return;
    }
    const hit = hitLine(p);
    if (hit) { selected = hit.id; draw(); o.onLine && o.onLine({ type: 'select', id: hit.id, cx: p.cx, cy: p.cy, ...midOf(hit, p) }); return; }
    if (selected) { selected = null; draw(); o.onLine && o.onLine({ type: 'select', id: null }); }
    if (e.pointerType === 'touch') { setCross(p); }
  };
  box.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pts.set(e.pointerId, { cx: e.clientX, cy: e.clientY });
    try { box.setPointerCapture(e.pointerId); } catch { /* not all browsers */ }
    if (pts.size === 2) { clearTimeout(timer); const [p1, p2] = [...pts.values()]; pinch = { d: Math.hypot(p1.cx - p2.cx, p1.cy - p2.cy), a, b }; gest = { kind: 'pinch' }; return; }
    const p = loc(e), r = region(p); gest = { kind: 'pending', r, x0: e.clientX, y0: e.clientY, a0: a, b0: b, p0: p, touch: e.pointerType === 'touch', yr0: yr ? { ...yr } : null, g0: G };
    if (r === 'plot' && o.canEdit && mode !== 'percent' && !tool) {
      const sel = selected && lines().find((l) => l.id === selected), hh = sel ? hitHandle(sel, p) : 0, hit = hh ? sel : hitLine(p);
      if (hit) { if (hit.id !== selected) { selected = hit.id; draw(); o.onLine && o.onLine({ type: 'select', id: hit.id, cx: p.cx, cy: p.cy, ...midOf(hit, p) }); } gest.line = hit; gest.handle = hh; gest.kind = 'pending'; }
    }
    if (gest.touch && r === 'plot' && !gest.line) timer = setTimeout(() => { if (gest && gest.kind === 'pending') { gest.kind = 'cross'; setCross(gest.p0); if (navigator.vibrate) try { navigator.vibrate(8); } catch { /* ignore */ } } }, 380);
  });
  box.addEventListener('pointermove', (e) => {
    const p = loc(e), prev = pts.get(e.pointerId); if (prev) { prev.cx = e.clientX; prev.cy = e.clientY; }
    if (!gest) {                                              // hover (mouse)
      if (e.pointerType === 'mouse') { const r = region(p); box.style.cursor = r === 'time' ? 'ew-resize' : r === 'price' ? 'ns-resize' : tool ? 'crosshair' : hitLine(p) ? 'pointer' : 'crosshair'; if (r === 'plot') setCross(p); else if (cross) clearCross(); if (draft && r === 'plot') { draft.to = p; draw(); setCross(p); } }
      return;
    }
    if (gest.kind === 'pinch') { if (pts.size < 2 || !pinch) return; const [p1, p2] = [...pts.values()], d = Math.hypot(p1.cx - p2.cx, p1.cy - p2.cy); if (d < 8) return; const r = box.getBoundingClientRect(), mx = ((p1.cx + p2.cx) / 2 - r.left) * (W / r.width), pos = pinch.a + ((mx - PL) / PW) * (pinch.b - pinch.a), f = pinch.d / d; set(pos - (pos - pinch.a) * f, pos + (pinch.b - pos) * f); commit(); return; }
    const dx = e.clientX - gest.x0, dy = e.clientY - gest.y0;
    if (gest.kind === 'pending') {
      const mv = Math.hypot(dx, dy); if (mv < (gest.touch ? 7 : 3)) return; clearTimeout(timer);
      if (gest.line) gest.kind = 'line';
      else if (gest.r === 'time') gest.kind = 'time';
      else if (gest.r === 'price') gest.kind = 'priceaxis';
      else if (gest.r === 'plot') { if (gest.touch && Math.abs(dy) > Math.abs(dx) * 1.2 && !selected && !tool) { gest = null; return; } gest.kind = 'pan'; box.style.cursor = 'grabbing'; }
      else { gest = null; return; }
    }
    const k = gest.p0.k;
    if (gest.kind === 'pan') { const dp = (-dx * k * (gest.b0 - gest.a0)) / PW; set(gest.a0 + dp, gest.b0 + dp); commit(); if (e.pointerType === 'mouse') setCross(p); }
    else if (gest.kind === 'cross') setCross(p);
    else if (gest.kind === 'time') { const f = Math.exp(-dx * k * 0.006), mid = (gest.a0 + gest.b0) / 2; set(mid - ((gest.b0 - gest.a0) * f) / 2, mid + ((gest.b0 - gest.a0) * f) / 2); commit(); }
    else if (gest.kind === 'priceaxis') { const g0 = gest.g0, f = Math.exp(-dy * k * 0.006), mid = gest.yr0 ? (gest.yr0.lo + gest.yr0.hi) / 2 : (g0.plo + g0.phi) / 2, half = ((gest.yr0 ? gest.yr0.hi - gest.yr0.lo : g0.phi - g0.plo) / 2) * f; yr = { lo: mid - half, hi: mid + half }; commit(); }
    else if (gest.kind === 'line') {
      const g = gest.g0 || G, l0 = gest.line, pos0 = (gest.p0.X - PL) / PW * (gest.b0 - gest.a0) + gest.a0, pos1 = (p.X - PL) / PW * (gest.b0 - gest.a0) + gest.a0, Tt = (q) => (q <= 0.5 ? T[0] + (q - 0.5) * avg : q >= n - 0.5 ? T[n - 1] + (q - (n - 0.5)) * avg : tOfPos(q));
      const dT = Tt(pos1) - Tt(pos0), dP = g.vOfY(p.Y) - g.vOfY(gest.p0.Y), moved = { ...l0 };
      if (gest.handle === 1) { moved.d1 = fromDayNo(Math.round(dayNo(l0.d1) + dT)); moved.p1 = l0.p1 + dP; } else if (gest.handle === 2) { moved.d2 = fromDayNo(Math.round(dayNo(l0.d2) + dT)); moved.p2 = l0.p2 + dP; }
      else { moved.d1 = fromDayNo(Math.round(dayNo(l0.d1) + dT)); moved.d2 = fromDayNo(Math.round(dayNo(l0.d2) + dT)); moved.p1 = l0.p1 + dP; moved.p2 = l0.p2 + dP; }
      drag = { line: moved }; draw(); setCross(p);
    }
  });
  const end = (e, cancelled) => {
    pts.delete(e.pointerId); clearTimeout(timer);
    if (!gest) return;
    const g = gest;
    if (g.kind === 'pinch') { if (pts.size < 2) { pinch = null; gest = null; } return; }
    gest = null; box.style.cursor = '';
    if (g.kind === 'pending' && !cancelled) finishTap(loc(e), e);
    else if (g.kind === 'line' && drag && !cancelled) { const ln = drag.line; drag = null; o.onLine && o.onLine({ type: 'change', line: ln }); draw(); }
    else if (g.kind === 'cross') { /* crosshair stays until the next touch */ }
    else if (g.kind === 'pan' || g.kind === 'time' || g.kind === 'priceaxis') reportView();
    if (drag) { drag = null; draw(); }
  };
  box.addEventListener('pointerup', (e) => end(e, false));
  box.addEventListener('pointercancel', (e) => end(e, true));
  box.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !gest) { if (cross) clearCross(); } });
  box.addEventListener('dblclick', (e) => { const r = region(loc(e)); if (r === 'time') { a = 0; b = n; draw(); reportView(); } else if (r === 'price') { yr = null; draw(); reportView(); } });
  box.addEventListener('wheel', (e) => {
    const p = loc(e); if (region(p) === 'axis') return;
    e.preventDefault();
    const dxy = e.deltaMode === 1 ? 16 : 1;
    if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) panBy(Math.sign(e.deltaX || e.deltaY) * 0.1 * (b - a));
    else zoomAt(p.X, Math.exp(Math.max(-60, Math.min(60, e.deltaY * dxy)) * 0.0022));
  }, { passive: false });
  box.addEventListener('touchmove', (e) => { if (gest && (gest.kind === 'cross' || gest.kind === 'pan' || gest.kind === 'line' || gest.kind === 'pinch' || gest.kind === 'time' || gest.kind === 'priceaxis')) e.preventDefault(); }, { passive: false });
  box.addEventListener('contextmenu', (e) => { if (gest && gest.touch) e.preventDefault(); });
  window.addEventListener('keydown', function esc(e) { if (!el.isConnected) { window.removeEventListener('keydown', esc); return; } if (e.key === 'Escape' && (draft || tool)) { draft = null; tool = null; o.onTool && o.onTool(null); draw(); } });
  draw();
  return api;
}
