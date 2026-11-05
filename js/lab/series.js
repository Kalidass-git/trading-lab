// Trading Lab: price-series maths for the chart, funds and indexes. Pure functions (no DOM, no network) so they can be tested.
// A history is { d: ['YYYY-MM-DD'...], o, h, l, c, v } with parallel arrays, oldest first (the same shape the backend sends).
import { xirr } from './perf.js';

const DAY = 864e5;
export const dayNo = (date) => Math.round(Date.parse(date + 'T00:00:00Z') / DAY);
export const fromDayNo = (n) => new Date(n * DAY).toISOString().slice(0, 10);

/** Index of the last entry on or before `date`, or -1. */
export function indexOn(d, date) {
  let lo = 0, hi = d.length - 1, r = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (d[m] <= date) { r = m; lo = m + 1; } else hi = m - 1; }
  return r;
}
/** A date moved back by whole calendar months (the 31st becomes the month's last day). */
export function monthsBack(date, months) {
  const y = Number(date.slice(0, 4)), m = Number(date.slice(5, 7)) - 1, day = Number(date.slice(8, 10));
  const t = y * 12 + m - months, ny = Math.floor(t / 12), nm = t - ny * 12, last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${String(nm + 1).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`;
}

// ---------- bars: day, week, month ----------
const monday = (date) => { const n = dayNo(date), wd = (n + 3) % 7; return fromDayNo(n - wd); };   // 1970-01-01 was a Thursday
const bucket = { day: (d) => d, week: monday, month: (d) => d.slice(0, 7) };
/** Auto choice of candle size from the number of calendar days on screen: day up to 6 months, week up to 6 years, month beyond. */
export const autoBars = (spanDays) => (spanDays <= 190 ? 'day' : spanDays <= 6 * 366 ? 'week' : 'month');
/**
 * Turns daily rows into weekly or monthly ones: open is the first open, close the last close, high and low the extremes, volume the sum.
 * Each bar is dated by its last trading day. `first` holds the index of the first daily row in each bar.
 */
export function toBars(hist, mode = 'day') {
  const n = hist.d.length;
  if (mode === 'day' || !bucket[mode] || n === 0) return { ...hist, first: hist.d.map((_, i) => i), mode: 'day' };
  const out = { d: [], o: [], h: [], l: [], c: [], v: [], first: [], mode };
  let key = null;
  for (let i = 0; i < n; i++) {
    const k = bucket[mode](hist.d[i]);
    if (k !== key) { key = k; out.d.push(hist.d[i]); out.o.push(hist.o[i]); out.h.push(hist.h[i]); out.l.push(hist.l[i]); out.c.push(hist.c[i]); out.v.push(hist.v[i] || 0); out.first.push(i); continue; }
    const j = out.d.length - 1;
    out.d[j] = hist.d[i]; out.c[j] = hist.c[i]; out.h[j] = Math.max(out.h[j], hist.h[i]); out.l[j] = Math.min(out.l[j], hist.l[i]); out.v[j] += hist.v[i] || 0;
  }
  return out;
}
/** A history that has only a close (a fund's NAV): open, high and low are the close, volume is zero. */
export function fromCloses(d, c) { return { d: d.slice(), o: c.slice(), h: c.slice(), l: c.slice(), c: c.slice(), v: c.map(() => 0) }; }
/** Last `n` rows from `from` onwards, as a new history. */
export const cutFrom = (hist, from) => { const s = (a) => a.slice(from); return { d: s(hist.d), o: s(hist.o), h: s(hist.h), l: s(hist.l), c: s(hist.c), v: s(hist.v) }; };

// ---------- indicators ----------
/** Simple moving average (null until enough rows). */
export function sma(c, n) { const out = []; let s = 0; for (let i = 0; i < c.length; i++) { s += c[i]; if (i >= n) s -= c[i - n]; out.push(i >= n - 1 ? s / n : null); } return out; }
/** Rolling return over `months`: a fraction for under a year, a yearly rate (CAGR) from a year up. Null where the history does not reach back far enough. */
export function rolling(d, c, months) {
  const out = new Array(d.length).fill(null), years = months / 12;
  if (!d.length) return out;
  for (let i = 0; i < d.length; i++) {
    const t = monthsBack(d[i], months);
    if (t < d[0]) continue;
    const j = indexOn(d, t);
    if (j < 0 || !(c[j] > 0) || dayNo(t) - dayNo(d[j]) > 7) continue;       // a gap of more than a week means there is no real start point
    const g = c[i] / c[j];
    out[i] = months >= 12 ? Math.pow(g, 1 / years) - 1 : g - 1;
  }
  return out;
}
/** Change since the first row, as a fraction (0.1 = +10%). */
export const sinceFirst = (c) => c.map((x) => (c[0] > 0 ? x / c[0] - 1 : null));
/** Rebased to 100 at the first row (for putting a fund and an index on one scale). */
export const rebase = (c, base = 100) => c.map((x) => (c[0] > 0 ? (x / c[0]) * base : null));

// ---------- summaries ----------
export function stats(values) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b), n = v.length;
  if (!n) return null;
  const q = (p) => { const k = (n - 1) * p, f = Math.floor(k), c = Math.ceil(k); return v[f] + (v[c] - v[f]) * (k - f); };
  return { n, min: v[0], max: v[n - 1], median: q(0.5), mean: v.reduce((a, b) => a + b, 0) / n, p10: q(0.1), p90: q(0.9), positive: v.filter((x) => x > 0).length / n };
}
/** Counts in equal-width buckets between min and max: [{ from, to, count }]. */
export function histogram(values, bins = 12) {
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length < 2) return [];
  const lo = Math.min(...v), hi = Math.max(...v), w = (hi - lo) / bins || 1;
  const out = Array.from({ length: bins }, (_, i) => ({ from: lo + i * w, to: lo + (i + 1) * w, count: 0 }));
  for (const x of v) out[Math.min(bins - 1, Math.floor((x - lo) / w))].count++;
  return out;
}
const PERIODS = [['1M', 1], ['3M', 3], ['6M', 6], ['1Y', 12], ['3Y', 36], ['5Y', 60], ['10Y', 120]];
/** Return to the last row for 1M..10Y. From 1Y up the figure is a yearly rate (annualised); `annual` says which. Null when the history is too short. */
export function periodReturns(d, c) {
  const n = d.length; if (!n) return [];
  const last = d[n - 1];
  return PERIODS.map(([label, m]) => {
    const t = monthsBack(last, m);
    if (t < d[0]) return { label, months: m, value: null, annual: m >= 12 };
    const j = indexOn(d, t);
    if (j < 0 || !(c[j] > 0) || dayNo(t) - dayNo(d[j]) > 7) return { label, months: m, value: null, annual: m >= 12 };
    const g = c[n - 1] / c[j];
    return { label, months: m, value: m >= 12 ? Math.pow(g, 12 / m) - 1 : g - 1, annual: m >= 12 };
  });
}
/** Return for each calendar year; the first and the current year are partial. */
export function calendarYears(d, c) {
  const out = []; if (d.length < 2) return out;
  let prev = null, y0 = d[0].slice(0, 4);
  for (let i = 0; i < d.length; i++) {
    const y = d[i].slice(0, 4), last = i === d.length - 1 || d[i + 1].slice(0, 4) !== y;
    if (!last) continue;
    const from = prev == null ? c[0] : prev;
    out.push({ year: y, value: from > 0 ? c[i] / from - 1 : null, partial: y === y0 && prev == null && d[0].slice(5) > '01-10' ? 'from ' + d[0] : (i === d.length - 1 && d[i].slice(5) < '12-20' ? 'to ' + d[i] : '') });
    prev = c[i];
  }
  return out;
}
/** Risk figures from daily-ish closes: yearly volatility (standard deviation of returns scaled to a year), deepest fall from a peak, and the current fall from the peak. */
export function riskStats(d, c) {
  if (c.length < 20) return null;
  const rets = []; for (let i = 1; i < c.length; i++) if (c[i - 1] > 0 && c[i] > 0) rets.push(Math.log(c[i] / c[i - 1]));
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length, sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, rets.length - 1));
  const perYear = c.length / Math.max(1 / 365, (dayNo(d[d.length - 1]) - dayNo(d[0])) / 365);   // observations per year (about 250 for daily data)
  let peak = c[0], peakD = d[0], dd = 0, ddFrom = d[0], ddTo = d[0];
  for (let i = 0; i < c.length; i++) {
    if (c[i] > peak) { peak = c[i]; peakD = d[i]; }
    const x = c[i] / peak - 1; if (x < dd) { dd = x; ddFrom = peakD; ddTo = d[i]; }
  }
  return { vol: sd * Math.sqrt(perYear), maxDrawdown: dd, ddFrom, ddTo, fromPeak: c[c.length - 1] / peak - 1 };
}
/**
 * A monthly SIP back-test on a series: `amount` bought on the first trading day of each month from `startDate` (or the first row) to the end.
 * Returns what was put in, what it is worth at the last row, the yearly rate (XIRR) and the growth curve.
 */
export function sip(d, c, { amount = 10000, startDate = null } = {}) {
  const n = d.length; if (n < 2 || !(amount > 0)) return null;
  const flows = [], curve = []; let units = 0, invested = 0, month = '';
  for (let i = 0; i < n; i++) {
    if (startDate && d[i] < startDate) continue;
    const m = d[i].slice(0, 7);
    if (m !== month && c[i] > 0) { month = m; units += amount / c[i]; invested += amount; flows.push({ date: d[i], amount: -amount }); }
    if (invested > 0) curve.push({ d: d[i], invested, value: units * c[i] });
  }
  if (!flows.length) return null;
  const value = units * c[n - 1];
  flows.push({ date: d[n - 1], amount: value });
  return { invested, value, units, gain: value - invested, ret: invested ? value / invested - 1 : null, xirr: xirr(flows), months: flows.length - 1, curve };
}
/** A one-off investment: the value of `amount` put in on `startDate`. */
export function lumpsum(d, c, { amount = 100000, startDate = null } = {}) {
  const n = d.length; if (n < 2) return null;
  const i = startDate ? Math.max(0, d.findIndex((x) => x >= startDate)) : 0;
  if (!(c[i] > 0)) return null;
  const value = amount * c[n - 1] / c[i], years = (dayNo(d[n - 1]) - dayNo(d[i])) / 365;
  return { from: d[i], invested: amount, value, ret: value / amount - 1, cagr: years >= 1 ? Math.pow(value / amount, 1 / years) - 1 : null };
}
/**
 * Rolling return of a fund against a benchmark over the same windows. Both are computed on the fund's dates; the benchmark value is taken
 * from its last row on or before each date (within 5 days). Returns { d, a, b, diff } arrays and a summary of how often the fund was ahead.
 */
export function compareRolling(fund, bench, months) {
  const ra = rolling(fund.d, fund.c, months), rb = rolling(bench.d, bench.c, months);
  const d = [], a = [], b = [];
  for (let i = 0; i < fund.d.length; i++) {
    if (ra[i] == null) continue;
    const j = indexOn(bench.d, fund.d[i]);
    if (j < 0 || rb[j] == null || dayNo(fund.d[i]) - dayNo(bench.d[j]) > 5) continue;
    d.push(fund.d[i]); a.push(ra[i]); b.push(rb[j]);
  }
  const diff = a.map((x, i) => x - b[i]);
  const ahead = diff.length ? diff.filter((x) => x > 0).length / diff.length : null;
  return { d, a, b, diff, ahead, fund: stats(a), bench: stats(b), gap: stats(diff), months, n: d.length };
}
/** Fund and benchmark rebased to 100 at the first date they both have. */
export function rebasedPair(fund, bench) {
  const start = fund.d.find((x) => x >= bench.d[0]);
  if (!start) return null;
  const fi = fund.d.indexOf(start), bi = Math.max(0, indexOn(bench.d, start)), d = [], a = [], b = [];
  for (let i = fi; i < fund.d.length; i++) {
    const j = indexOn(bench.d, fund.d[i]); if (j < 0) continue;
    d.push(fund.d[i]); a.push(fund.c[i] / fund.c[fi] * 100); b.push(bench.c[j] / bench.c[bi] * 100);
  }
  return d.length > 1 ? { d, a, b } : null;
}
/** Candles that are complete: a weekly or monthly bar is complete once a later bucket has started (or the data's last day is past the bucket's end). */
export function finishedCount(bars, today) {
  const n = bars.d.length; if (!n) return 0;
  const last = bars.d[n - 1];
  if (bars.mode === 'day') return last < today ? n : n - 1;
  const key = bucket[bars.mode];
  return key(today) > key(last) ? n : n - 1;
}
/** Wilder's RSI (0 to 100) over closes; null until n+1 closes. */
export function rsi(c, n = 14) {
  const out = new Array(c.length).fill(null); if (c.length <= n) return out;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) { const d = c[i] - c[i - 1]; if (d >= 0) g += d; else l -= d; }
  g /= n; l /= n; out[n] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  for (let i = n + 1; i < c.length; i++) { const d = c[i] - c[i - 1]; g = (g * (n - 1) + Math.max(d, 0)) / n; l = (l * (n - 1) + Math.max(-d, 0)) / n; out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); }
  return out;
}
/** A daily-series array (same length as the daily rows) read at the last day of each bar, so a 50-day average stays a 50-day average on weekly bars. */
export function sampleAt(values, bars, dailyCount) {
  if (!bars.first || bars.mode === 'day') return values;
  return bars.first.map((_, j) => values[(j + 1 < bars.first.length ? bars.first[j + 1] : dailyCount) - 1]);
}
