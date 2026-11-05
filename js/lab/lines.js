// Trading Lab: trendlines drawn on charts, and their alerts. They are saved with the person's data as an optional list (lab.lines), so older
// data keeps working. Each line: { id, sym, d1, p1, d2, p2, color?, alert?: { dir: 'above'|'below', bar: 'day'|'week'|'month', since, dismissed? } }.
// Alerts are checked only against price history already on this device; nothing is fetched to check them.
import { newId } from './model.js';
import { dayNo, toBars, finishedCount } from './series.js';

const key = (s) => String(s || '').toUpperCase();
const num = (x) => Math.round(Number(x) * 1e4) / 1e4;
export const linesFor = (lab, sym) => ((lab && lab.lines) || []).filter((l) => l.sym === key(sym));
export function addLine(lab, sym, ln) {
  if (![ln.p1, ln.p2].every((x) => Number.isFinite(Number(x)) && Number(x) > 0) || !/^\d{4}-\d\d-\d\d$/.test(ln.d1) || !/^\d{4}-\d\d-\d\d$/.test(ln.d2)) throw new Error('That line has no valid points.');
  const line = { id: newId('tl'), sym: key(sym), d1: ln.d1, p1: num(ln.p1), d2: ln.d2, p2: num(ln.p2) };
  if (ln.color) line.color = ln.color;
  (lab.lines = lab.lines || []).push(line); return line.id;
}
export function updateLine(lab, id, patch) {
  const l = (lab.lines || []).find((x) => x.id === id); if (!l) throw new Error('That line was already deleted.');
  for (const k of ['d1', 'd2', 'color']) if (patch[k] !== undefined) l[k] = patch[k];
  for (const k of ['p1', 'p2']) if (patch[k] !== undefined) l[k] = num(patch[k]);
  if (patch.alert !== undefined) { if (patch.alert) l.alert = patch.alert; else delete l.alert; }
  return l;
}
export const removeLine = (lab, id) => { lab.lines = (lab.lines || []).filter((l) => l.id !== id); };
export const clearLines = (lab, sym) => { lab.lines = (lab.lines || []).filter((l) => l.sym !== key(sym)); };
/** Price on the line at a day number (the line carries on past its two points). */
export const priceAt = (l, t) => { const t1 = dayNo(l.d1), t2 = dayNo(l.d2); return t1 === t2 ? l.p1 : l.p1 + ((l.p2 - l.p1) * (t - t1)) / (t2 - t1); };
/**
 * The first finished candle that closed beyond the line, after the alert was set and not already dismissed; null when none.
 * A weekly or monthly candle counts only once it is complete, and one that began before the alert was set does not count.
 */
export function checkAlert(l, hist, today) {
  const a = l.alert; if (!a || !hist || !hist.d || hist.d.length < 2) return null;
  const bars = toBars(hist, a.bar || 'day'), done = finishedCount(bars, today);
  for (let j = 0; j < done; j++) {
    const first = hist.d[bars.first[j]];
    if (first < a.since || (a.dismissed && bars.d[j] <= a.dismissed)) continue;
    const level = priceAt(l, dayNo(bars.d[j])), close = bars.c[j];
    if (a.dir === 'below' ? close < level : close > level) return { date: bars.d[j], close, level, dir: a.dir, bar: a.bar || 'day' };
  }
  return null;
}
/** Every line with an alert that has fired: [{ line, hit }]. `histOf(sym)` returns the saved history for a symbol or null. */
export function fired(lab, histOf, today) {
  const out = [];
  for (const l of lab.lines || []) { if (!l.alert) continue; const h = histOf(l.sym), hit = h && checkAlert(l, h, today); if (hit) out.push({ line: l, hit }); }
  return out;
}
