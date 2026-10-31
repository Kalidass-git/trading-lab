// Dependency-free SVG/HTML charts. Colors come from CSS variables --s1..--s8 (validated categorical palette, light and dark).
import { h, isMasked } from './ui.js';

const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  kids.flat().forEach((k) => k && el.append(k.nodeType ? k : document.createTextNode(k)));
  return el;
};
export const color = (i) => `var(--s${(i % 8) + 1})`;

// One shared floating tooltip
let tipEl;
function tip() {
  if (!tipEl) { tipEl = h('div', { class: 'tip', role: 'tooltip' }); document.body.append(tipEl); }
  return tipEl;
}
export function showTip(e, html) {
  const t = tip();
  t.replaceChildren(...html);
  t.style.display = 'block';
  const r = t.getBoundingClientRect();
  const x = Math.min(e.clientX + 14, window.innerWidth - r.width - 8), y = Math.max(8, e.clientY - r.height - 12);
  t.style.transform = `translate(${Math.max(8, x)}px, ${y}px)`;
}
export const hideTip = () => { if (tipEl) tipEl.style.display = 'none'; };
const hover = (el, build) => {
  el.addEventListener('pointermove', (e) => showTip(e, build()));
  el.addEventListener('pointerleave', hideTip);
};

/** Stacked strip: the portfolio "spine". items: [{label, value, fmt}] */
export function strip(items, { fmt, total } = {}) {
  const sum = total ?? items.reduce((a, x) => a + Math.max(0, x.value), 0);
  const bar = h('div', { class: 'strip', role: 'img', 'aria-label': items.map((i) => `${i.label} ${((i.value / sum) * 100).toFixed(1)}%`).join(', ') });
  items.forEach((it, i) => {
    if (it.value <= 0) return;
    const seg = h('span', { class: 'seg', style: { flexGrow: String(it.value), background: it.color || color(i) }, 'data-i': i });
    hover(seg, () => [h('b', null, it.label), h('div', null, (fmt ? fmt(it.value) : it.value) + '  ·  ' + ((it.value / sum) * 100).toFixed(1) + '%')]);
    bar.append(seg);
  });
  return bar;
}
export function legend(items, { fmt, onSelect = null } = {}) {
  const sum = items.reduce((a, x) => a + Math.max(0, x.value), 0);
  return h('ul', { class: 'legend' }, items.map((it, i) => h('li', onSelect ? { class: 'click', tabindex: 0, onclick: () => onSelect(it, i), onkeydown: (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect(it, i)) } : null,
    h('i', { style: { background: it.color || color(i) } }),
    h('span', { class: 'lg-name' }, it.label),
    h('span', { class: 'lg-val' }, fmt ? fmt(it.value) : it.value),
    h('span', { class: 'lg-pct' }, sum ? ((it.value / sum) * 100).toFixed(1) + '%' : ''))));
}

/** Horizontal bars for category breakdowns. rows: [{label, value, sub}] */
export function hbars(rows, { fmt = (v) => v, max, colorIndex = 0, onClick } = {}) {
  const m = max ?? Math.max(1, ...rows.map((r) => r.value));
  return h('ul', { class: 'hbars' }, rows.map((r) => h('li', { class: onClick ? 'click' : '', onclick: onClick ? () => onClick(r) : null },
    h('span', { class: 'hb-label' }, r.label),
    h('span', { class: 'hb-track' }, h('span', { class: 'hb-fill', style: { width: Math.max(1.5, (r.value / m) * 100) + '%', background: color(r.ci ?? colorIndex) } })),
    h('span', { class: 'hb-val' }, fmt(r.value)))));
}

/** Draw to about the size it will be shown at, so axis text stays readable on a phone. */
const defaultWidth = () => (typeof window !== 'undefined' && window.innerWidth < 640 ? 380 : 640);
const niceMax = (v) => {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
};
const short = (v) => {
  if (isMasked()) return '';
  const a = Math.abs(v), s = v < 0 ? '-' : '';
  if (a >= 1e7) return s + +(a / 1e7).toFixed(2) + 'Cr';
  if (a >= 1e5) return s + +(a / 1e5).toFixed(2) + 'L';
  if (a >= 1e3) return s + +(a / 1e3).toFixed(0) + 'k';
  return s + Math.round(a);
};

/**
 * Line chart. series: [{name, values:[n|null], dashed}] ; labels: x labels (same length).
 */
export function lineChart({ labels, series, fmt = (v) => v, height = 220, yMin, area = false, width, tipLabels }) {
  const W = width || defaultWidth(), H = height, pad = { l: 44, r: 12, t: 12, b: 24 };
  const all = series.flatMap((s) => s.values).filter((v) => v != null);
  const lo = yMin ?? Math.min(0, ...all), hi = niceMax(Math.max(...all, 1));
  const x = (i) => pad.l + (labels.length < 2 ? 0 : (i / (labels.length - 1)) * (W - pad.l - pad.r));
  const y = (v) => pad.t + (1 - (v - lo) / (hi - lo || 1)) * (H - pad.t - pad.b);
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': series.map((s) => s.name).join(' and ') });
  for (let i = 0; i <= 4; i++) {
    const v = lo + ((hi - lo) * i) / 4;
    root.append(svg('line', { x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v), class: 'grid' }), svg('text', { x: pad.l - 6, y: y(v) + 3.5, class: 'axis', 'text-anchor': 'end' }, short(v)));
  }
  const step = Math.max(1, Math.ceil(labels.length / 8));
  labels.forEach((l, i) => { if ((i % step === 0 && (labels.length - 1 - i >= step * 0.7 || i === 0 || i === labels.length - 1)) || i === labels.length - 1) root.append(svg('text', { x: x(i), y: H - 6, class: 'axis', 'text-anchor': i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle' }, l)); });
  series.forEach((s, si) => {
    let d = '', started = false;
    s.values.forEach((v, i) => { if (v == null) { started = false; return; } d += `${started ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`; started = true; });
    if (area && si === 0) root.append(svg('path', { d: d + `L${x(labels.length - 1)},${y(lo)}L${x(0)},${y(lo)}Z`, fill: color(si), opacity: '.12' }));
    root.append(svg('path', { d, fill: 'none', stroke: color(s.color ?? si), 'stroke-width': 2, 'stroke-dasharray': s.dash || (s.dashed ? '5 4' : null), 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  });
  const cross = svg('line', { y1: pad.t, y2: H - pad.b, class: 'cross', style: 'display:none' });
  const dots = series.map((s, si) => svg('circle', { r: 4, fill: color(s.color ?? si), class: 'dot', style: 'display:none' }));
  root.append(cross, ...dots);
  const hit = svg('rect', { x: pad.l, y: pad.t, width: W - pad.l - pad.r, height: H - pad.t - pad.b, fill: 'transparent' });
  hit.addEventListener('pointermove', (e) => {
    const r = root.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(labels.length - 1, Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (labels.length - 1))));
    cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.style.display = '';
    series.forEach((s, si) => { const v = s.values[i]; const d = dots[si]; if (v == null) d.style.display = 'none'; else { d.setAttribute('cx', x(i)); d.setAttribute('cy', y(v)); d.style.display = ''; } });
    showTip(e, [h('b', null, (tipLabels || labels)[i]), ...series.filter((s) => s.values[i] != null).map((s, si) => h('div', null, h('i', { class: 'tip-dot', style: { background: color(s.color ?? si) } }), `${s.name}: ${fmt(s.values[i])}`))]);
  });
  hit.addEventListener('pointerleave', () => { cross.style.display = 'none'; dots.forEach((d) => (d.style.display = 'none')); hideTip(); });
  root.append(hit);
  return h('div', { class: 'chart-box' }, root, series.length > 1 ? h('ul', { class: 'legend inline' }, series.map((s, i) => h('li', null, h('i', { style: { background: color(s.color ?? i), ...(s.dashed ? { opacity: '.6' } : {}) } }), h('span', { class: 'lg-name' }, s.name)))) : null);
}

/** Grouped column chart. groups: [{label, values:[n]}], names: series names */
export function barChart({ groups, names, fmt = (v) => v, height = 220, width, colors }) {
  const col = (i) => color(colors ? colors[i] : i);
  const W = width || defaultWidth(), H = height, pad = { l: 44, r: 8, t: 12, b: 24 };
  const hi = niceMax(Math.max(1, ...groups.flatMap((g) => g.values)));
  const y = (v) => pad.t + (1 - v / hi) * (H - pad.t - pad.b);
  const gw = (W - pad.l - pad.r) / groups.length;
  const bw = Math.min(26, (gw - 8) / names.length - 2);
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': names.join(', ') });
  for (let i = 0; i <= 4; i++) {
    const v = (hi * i) / 4;
    root.append(svg('line', { x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v), class: 'grid' }), svg('text', { x: pad.l - 6, y: y(v) + 3.5, class: 'axis', 'text-anchor': 'end' }, short(v)));
  }
  groups.forEach((g, gi) => {
    const cx = pad.l + gw * gi + gw / 2;
    const left = cx - ((bw + 2) * names.length) / 2;
    g.values.forEach((v, si) => {
      if (v <= 0) return;
      const bh = Math.max(1, H - pad.b - y(v));
      root.append(svg('path', { d: `M${left + si * (bw + 2)},${H - pad.b}v${-(bh - Math.min(4, bh))}q0,-${Math.min(4, bh)} ${Math.min(4, bw / 2)},-${Math.min(4, bh)}h${bw - 2 * Math.min(4, bw / 2)}q${Math.min(4, bw / 2)},0 ${Math.min(4, bw / 2)},${Math.min(4, bh)}v${bh - Math.min(4, bh)}z`, fill: col(si) }));
    });
    root.append(svg('text', { x: cx, y: H - 6, class: 'axis', 'text-anchor': 'middle' }, g.label));
    const hit = svg('rect', { x: pad.l + gw * gi, y: pad.t, width: gw, height: H - pad.t - pad.b, fill: 'transparent' });
    hover(hit, () => [h('b', null, g.title || g.label), ...names.map((n, si) => h('div', null, h('i', { class: 'tip-dot', style: { background: col(si) } }), `${n}: ${fmt(g.values[si])}`))]);
    root.append(hit);
  });
  return h('div', { class: 'chart-box' }, root, h('ul', { class: 'legend inline' }, names.map((n, i) => h('li', null, h('i', { style: { background: col(i) } }), h('span', { class: 'lg-name' }, n)))));
}

/**
 * Grouped columns where every column is stacked by its parts. groups: [{label, title, bars:[[{name, value}]]}] (one list of parts per series),
 * names: the series names. Tap a column to select it: onSelect(groupIndex, seriesIndex). Parts get lighter the further down the list they are.
 */
export function stackedBars({ groups, names, colors, partColors = null, fmt = (v) => v, height = 230, width, onSelect = null, selected = null }) {
  const col = (i) => color(colors ? colors[i] : i);
  const W = width || defaultWidth(), H = height, pad = { l: 44, r: 8, t: 12, b: 24 };
  const tot = (b) => b.reduce((a, x) => a + Math.max(0, x.value), 0);
  const hi = niceMax(Math.max(1, ...groups.flatMap((g) => g.bars.map(tot))));
  const y = (v) => pad.t + (1 - v / hi) * (H - pad.t - pad.b);
  const gw = (W - pad.l - pad.r) / groups.length;
  const bw = Math.min(34, (gw - 8) / names.length - 2);
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': names.join(', ') });
  for (let i = 0; i <= 4; i++) { const v = (hi * i) / 4; root.append(svg('line', { x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v), class: 'grid' }), svg('text', { x: pad.l - 6, y: y(v) + 3.5, class: 'axis', 'text-anchor': 'end' }, short(v))); }
  const op = (k) => Math.max(0.28, 1 - k * 0.17);
  groups.forEach((g, gi) => {
    const cx = pad.l + gw * gi + gw / 2, left = cx - ((bw + 2) * names.length) / 2;
    g.bars.forEach((parts, si) => {
      const x0 = left + si * (bw + 2), isSel = selected && selected.g === gi && selected.s === si, dim = selected && !isSel;
      let acc = 0;
      parts.forEach((pt, k) => {
        const v = Math.max(0, pt.value); if (v <= 0) return;
        const y1 = y(acc + v), y0 = y(acc); acc += v;
        const r = svg('rect', { x: x0, y: y1, width: bw, height: Math.max(0.5, y0 - y1), fill: partColors && partColors[pt.name] ? partColors[pt.name] : col(si), opacity: dim ? 0.25 : partColors ? (g.faded ? 0.5 : 1) : g.faded ? op(k) * 0.55 : op(k), stroke: 'var(--surface, #fff)', 'stroke-width': 0.8, 'stroke-dasharray': g.faded ? '3 2' : null });
        hover(r, () => [h('b', null, `${g.title || g.label} · ${names[si]}`), h('div', null, `${pt.name}: ${fmt(pt.value)}`), ...(pt.detail || []).map((d) => h('div', { class: 'muted' }, `· ${d.name}: ${fmt(d.amount)}`)), h('div', { class: 'muted' }, `Total: ${fmt(tot(parts))}`)]);
        root.append(r);
      });
      if (isSel) root.append(svg('rect', { x: x0 - 1.5, y: y(acc) - 1.5, width: bw + 3, height: Math.max(3, y(0) - y(acc) + 3), fill: 'none', stroke: 'var(--text, #222)', 'stroke-width': 1.5, rx: 2 }));
      if (onSelect) {
        const slot = (gw - 4) / names.length, hit = svg('rect', { x: cx - gw / 2 + 2 + si * slot, y: pad.t, width: slot, height: H - pad.t - pad.b, fill: 'transparent', style: 'cursor:pointer', tabindex: 0, role: 'button', 'aria-label': `${g.title || g.label}, ${names[si]}, ${fmt(tot(parts))}. Show what is inside` });
        hit.addEventListener('click', () => onSelect(gi, si));
        hit.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(gi, si); } });
        root.append(hit);
      }
    });
    root.append(svg('text', { x: cx, y: H - 6, class: 'axis', 'text-anchor': 'middle' }, g.label));
  });
  return h('div', { class: 'chart-box' }, root, h('ul', { class: 'legend inline' }, names.map((n, i) => h('li', null, h('i', { style: { background: col(i) } }), h('span', { class: 'lg-name' }, n)))));
}

/** Tiny progress bar (value 0..1) */
export const meter = (v, ci = 0) => h('span', { class: 'meter' }, h('span', { style: { width: Math.min(100, Math.max(0, v * 100)) + '%', background: color(ci) } }));

/** Donut with the grand total in the middle. items: [{label, value}] (colors follow the list order, same as legend()). */
export function donut(items, { fmt = (v) => v, center = '', sub = '', size = 200, onSelect = null } = {}) {
  const sum = items.reduce((a, x) => a + Math.max(0, x.value), 0) || 1;
  const cx = 100, cy = 100, R = 92, r = 62;
  const root = svg('svg', { viewBox: '0 0 200 200', class: 'donut-svg', role: 'img', 'aria-label': items.map((i) => `${i.label} ${((i.value / sum) * 100).toFixed(1)}%`).join(', '), style: `max-width:${size}px` });
  const pt = (rad, a) => [cx + rad * Math.sin(a), cy - rad * Math.cos(a)];
  let a0 = 0;
  const live = items.filter((x) => x.value > 0).length;
  items.forEach((it, i) => {
    if (it.value <= 0) return;
    const frac = it.value / sum, gap = live > 1 ? 0.012 : 0;
    const s = a0 + gap, e = a0 + frac * 2 * Math.PI - gap;
    a0 += frac * 2 * Math.PI;
    let d;
    if (frac > 0.9999) d = `M${cx},${cy - R}A${R},${R} 0 1 1 ${cx - 0.01},${cy - R}ZM${cx},${cy - r}A${r},${r} 0 1 0 ${cx - 0.01},${cy - r}Z`;
    else {
      const [x1, y1] = pt(R, s), [x2, y2] = pt(R, e), [x3, y3] = pt(r, e), [x4, y4] = pt(r, s), big = e - s > Math.PI ? 1 : 0;
      d = `M${x1.toFixed(2)},${y1.toFixed(2)}A${R},${R} 0 ${big} 1 ${x2.toFixed(2)},${y2.toFixed(2)}L${x3.toFixed(2)},${y3.toFixed(2)}A${r},${r} 0 ${big} 0 ${x4.toFixed(2)},${y4.toFixed(2)}Z`;
    }
    const seg = svg('path', { d, fill: it.color || color(i), class: 'dseg' + (onSelect ? ' click' : ''), 'fill-rule': 'evenodd' });
    if (onSelect) { seg.addEventListener('click', () => onSelect(it, i)); seg.setAttribute('tabindex', '0'); seg.setAttribute('role', 'button'); seg.setAttribute('aria-label', 'Show what is inside ' + it.label); seg.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(it, i); } }); }
    hover(seg, () => [h('b', null, it.label), h('div', null, fmt(it.value) + '  ·  ' + ((it.value / sum) * 100).toFixed(1) + '%')]);
    root.append(seg);
  });
  root.append(svg('text', { x: cx, y: sub ? cy - 2 : cy + 7, class: 'donut-c', 'text-anchor': 'middle' }, center));
  if (sub) root.append(svg('text', { x: cx, y: cy + 16, class: 'donut-s', 'text-anchor': 'middle' }, sub));
  return h('div', { class: 'donut' }, root);
}

/** Small trend line without axes, for tiles. values: numbers. */
export function spark(values, { height = 36, width = 120, tone = 0 } = {}) {
  if (values.length < 2) return null;
  const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
  const x = (i) => (i / (values.length - 1)) * (width - 4) + 2, y = (v) => height - 3 - ((v - lo) / span) * (height - 6);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  return svg('svg', { viewBox: `0 0 ${width} ${height}`, class: 'spark', 'aria-hidden': 'true', width, height },
    svg('path', { d: d + `L${x(values.length - 1)},${height}L${x(0)},${height}Z`, fill: color(tone), opacity: '.14' }),
    svg('path', { d, fill: 'none', stroke: color(tone), 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
}

/** Green for safe through amber to deep red for very high risk. Known group ids get fixed colours; custom groups are spread along the same ramp in order. */
const RISK = { safe: '#1b7f3b', low: '#7cb342', medium: '#f2b01e', mediumhigh: '#ef8a1f', high: '#e5483a', vhigh: '#a1171d' };
const RAMP = ['#1b7f3b', '#7cb342', '#f2b01e', '#ef8a1f', '#e5483a', '#a1171d'];
export function riskColor(id, index = 0, count = 1) {
  if (RISK[id]) return RISK[id];
  return RAMP[count <= 1 ? 2 : Math.round((index / (count - 1)) * (RAMP.length - 1))];
}

/** Stacked area: each series sits on top of the one before, filled in its own colour. series: [{name, values, color}] (color = palette index or a CSS colour). */
export function stackedArea({ labels, series, fmt = (v) => v, height = 240, width, onSelect = null }) {
  const W = width || defaultWidth(), H = height, pad = { l: 44, r: 12, t: 12, b: 24 };
  const n = labels.length;
  const totals = labels.map((_, i) => series.reduce((a, s) => a + Math.max(0, s.values[i] || 0), 0));
  const hi = niceMax(Math.max(1, ...totals));
  const x = (i) => pad.l + (n < 2 ? 0 : (i / (n - 1)) * (W - pad.l - pad.r));
  const y = (v) => pad.t + (1 - v / hi) * (H - pad.t - pad.b);
  const col = (s, i) => (typeof s.color === 'string' ? s.color : color(s.color ?? i));
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': series.map((s) => s.name).join(', ') });
  for (let i = 0; i <= 4; i++) { const v = (hi * i) / 4; root.append(svg('line', { x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v), class: 'grid' }), svg('text', { x: pad.l - 6, y: y(v) + 3.5, class: 'axis', 'text-anchor': 'end' }, short(v))); }
  const step = Math.max(1, Math.ceil(n / 8));
  labels.forEach((l, i) => { if (i % step === 0 || i === n - 1) root.append(svg('text', { x: x(i), y: H - 6, class: 'axis', 'text-anchor': i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle' }, l)); });
  const base = labels.map(() => 0);
  series.forEach((s, si) => {
    const top = s.values.map((v, i) => base[i] + Math.max(0, v || 0));
    let d = top.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
    d += base.slice().reverse().map((v, k) => `L${x(n - 1 - k).toFixed(1)},${y(v).toFixed(1)}`).join('') + 'Z';
    root.append(svg('path', { d, fill: col(s, si), opacity: '.85', stroke: 'var(--surface, #fff)', 'stroke-width': 1 }));
    top.forEach((v, i) => { base[i] = v; });
  });
  const cross = svg('line', { y1: pad.t, y2: H - pad.b, class: 'cross', style: 'display:none' });
  root.append(cross);
  const hit = svg('rect', { x: pad.l, y: pad.t, width: W - pad.l - pad.r, height: H - pad.t - pad.b, fill: 'transparent' });
  hit.addEventListener('pointermove', (e) => {
    const r = root.getBoundingClientRect(), px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(n - 1, Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (n - 1))));
    cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.style.display = '';
    showTip(e, [h('b', null, labels[i]), ...series.map((s, si) => h('div', null, h('i', { class: 'tip-dot', style: { background: col(s, si) } }), `${s.name}: ${fmt(s.values[i] || 0)}`)), series.length > 1 ? h('div', null, `Total: ${fmt(totals[i])}`) : null].filter(Boolean));
  });
  hit.addEventListener('pointerleave', () => { cross.style.display = 'none'; hideTip(); });
  if (onSelect) {
    hit.style.cursor = 'pointer';
    hit.addEventListener('click', (e) => {
      const r = root.getBoundingClientRect(), px = ((e.clientX - r.left) / r.width) * W, py = ((e.clientY - r.top) / r.height) * H;
      const i = Math.max(0, Math.min(n - 1, Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (n - 1))));
      const v = (1 - (py - pad.t) / (H - pad.t - pad.b)) * hi;
      let acc = 0;
      for (const sr of series) { acc += Math.max(0, sr.values[i] || 0); if (v <= acc) { onSelect(sr); return; } }
    });
  }
  return h('div', { class: 'chart-box' }, root, series.length > 1 ? h('ul', { class: 'legend inline' }, series.map((s, i) => h('li', onSelect ? { style: { cursor: 'pointer' }, onclick: () => onSelect(s) } : null, h('i', { style: { background: col(s, i) } }), h('span', { class: 'lg-name' }, s.name)))) : null);
}
