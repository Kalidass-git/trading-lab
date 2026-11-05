// Series maths for charts, funds and indexes. node tests/lab-series.test.mjs
import * as S from '../js/lab/series.js';
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } else console.log('ok  ', m); };
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;
// a series growing exactly 1% a calendar month, one row on the 1st and one on the 15th, 2020-01 .. 2024-12
const d = [], c = [];
for (let m = 0; m < 60; m++) for (const day of ['01', '15']) { const y = 2020 + Math.floor(m / 12), mm = (m % 12) + 1; d.push(`${y}-${String(mm).padStart(2, '0')}-${day}`); c.push(100 * Math.pow(1.01, m) * (day === '15' ? 1.004 : 1)); }
ok(S.monthsBack('2024-03-31', 1) === '2024-02-29' && S.monthsBack('2024-01-15', 12) === '2023-01-15', 'monthsBack clamps to the month end and steps whole months');
ok(S.indexOn(d, '2020-01-10') === 0 && S.indexOn(d, '2019-12-31') === -1 && S.indexOn(d, '2030-01-01') === d.length - 1, 'indexOn: on or before, -1 before the start');
// weeks and months
const daily = { d: ['2026-10-26', '2026-10-27', '2026-10-30', '2026-11-02', '2026-11-03'], o: [10, 11, 12, 13, 14], h: [12, 13, 15, 14, 16], l: [9, 10, 11, 12, 13], c: [11, 12, 14, 13, 15], v: [1, 2, 3, 4, 5] };
const w = S.toBars(daily, 'week');
ok(w.d.length === 2 && w.o[0] === 10 && w.c[0] === 14 && w.h[0] === 15 && w.l[0] === 9 && w.v[0] === 6 && w.d[0] === '2026-10-30', 'week bar: first open, last close, extremes, summed volume, dated by its last day (Mon 26 Oct to Fri 30 Oct)');
ok(w.d[1] === '2026-11-03' && w.o[1] === 13 && w.c[1] === 15 && w.first[1] === 3, 'the next week starts on Monday 2 Nov');
const mo = S.toBars(daily, 'month');
ok(mo.d.length === 2 && mo.c[0] === 14 && mo.o[1] === 13 && mo.v[1] === 9, 'month bars split at the month end');
ok(S.autoBars(100) === 'day' && S.autoBars(365) === 'week' && S.autoBars(6 * 366 + 1) === 'month', 'auto bars: day to 6 months, week to 6 years, month beyond');
ok(S.finishedCount(w, '2026-11-03') === 1 && S.finishedCount(w, '2026-11-09') === 2 && S.finishedCount(S.toBars(daily, 'day'), '2026-11-03') === 4, 'finished candles: the running week and the day in progress are not counted');
// rolling
const r12 = S.rolling(d, c, 12), expect12 = Math.pow(1.01, 12) - 1;
ok(r12[0] === null && r12[23] === null && near(r12[24], expect12) && near(r12[119], expect12), 'rolling 12M: null until a year of history, then 1.01^12-1');
const r36 = S.rolling(d, c, 36);
ok(near(r36[100], Math.pow(1.01, 12) - 1), 'rolling 36M is a yearly rate (CAGR), so the same 12.68%');
const r3 = S.rolling(d, c, 3);
ok(near(r3[20], Math.pow(1.01, 3) - 1), 'under a year the figure is plain, not annualised');
// period returns
const pr = S.periodReturns(d, c);
ok(near(pr.find((x) => x.label === '1Y').value, expect12) && near(pr.find((x) => x.label === '1M').value, 0.01) && pr.find((x) => x.label === '5Y').value == null && pr.find((x) => x.label === '3Y').annual, 'period returns: 1M plain, 1Y+ yearly, 5Y null (history is under 5 years from 15th Dec)');
// stats and histogram
const st = S.stats([1, 2, 3, 4, 5, -1]);
ok(st.n === 6 && st.min === -1 && st.max === 5 && st.median === 2.5 && near(st.positive, 5 / 6) && S.stats([]) === null, 'stats: median, share positive, empty gives null');
const hg = S.histogram([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5);
ok(hg.length === 5 && hg.reduce((a, b) => a + b.count, 0) === 11 && hg[4].count >= 2, 'histogram keeps every value, the maximum lands in the last bucket');
// compare rolling
const bench = { d, c: c.map((x) => x * 0.99) }, fund = { d, c };
const cmp = S.compareRolling(fund, bench, 12);
ok(cmp.n > 0 && Math.abs(cmp.gap.max) < 1e-9 && Math.abs(cmp.gap.min) < 1e-9, 'compare: a series that is a constant multiple of the other never leads (same rolling return)');
const slow = { d, c: c.map((x, i) => 100 * Math.pow(1.005, Math.floor(i / 2))) };
const cmp2 = S.compareRolling(fund, slow, 12);
ok(cmp2.ahead === 1 && cmp2.gap.min > 0 && near(cmp2.b[0], Math.pow(1.005, 12) - 1), 'a faster fund is ahead 100% of the time, and the benchmark rolling value is right');
const cmp3 = S.compareRolling(slow, fund, 12);
ok(cmp3.ahead === 0, 'a slower fund is ahead 0% of the time');
ok(S.compareRolling(fund, { d: ['2020-01-01'], c: [100] }, 12).n === 0, 'a benchmark with too little history gives no points instead of nonsense');
// SIP: flat price then double: value is exactly double what was bought in the first half
const sd = [], sc = []; for (let m = 0; m < 24; m++) { sd.push(`${2022 + Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, '0')}-02`); sc.push(m < 12 ? 100 : 200); }
const sp = S.sip(sd, sc, { amount: 1000 });
ok(sp.invested === 24000 && near(sp.value, 12 * 10 * 200 + 12 * 5 * 200) && sp.months === 24, 'SIP: 12 months at 100 buy 120 units, 12 at 200 buy 60, all worth 200 each');
ok(sp.xirr != null && sp.xirr > 0.3, 'SIP XIRR is a large positive rate when the price doubles');
ok(S.sip(sd, sc, { amount: 1000, startDate: '2023-01-01' }).invested === 12000 && S.sip([], [], {}) === null, 'SIP honours a start date, empty input gives null');
const ls = S.lumpsum(sd, sc, { amount: 1000 });
ok(ls.value === 2000 && near(ls.ret, 1), 'lumpsum doubles');
// calendar years
const cy = S.calendarYears(['2022-03-01', '2022-12-30', '2023-06-01', '2023-12-29', '2024-02-01'], [100, 110, 120, 132, 140]);
ok(cy.length === 3 && near(cy[0].value, 0.1) && near(cy[1].value, 132 / 110 - 1) && near(cy[2].value, 140 / 132 - 1) && cy[2].partial.startsWith('to'), 'calendar years: each year versus the previous year end, the running year marked partial');
// risk
const rk = S.riskStats(d, c);
ok(rk.maxDrawdown <= 0 && rk.maxDrawdown > -0.01 && rk.vol > 0, 'risk: a steady climber has a tiny drawdown');
const dd = S.riskStats(Array.from({ length: 30 }, (_, i) => `2024-01-${String(i + 1).padStart(2, '0')}`), [...Array(10).fill(100), ...Array(10).fill(50), ...Array(10).fill(75)]);
ok(near(dd.maxDrawdown, -0.5) && near(dd.fromPeak, -0.25), 'risk: a halving is -50%, and recovering to 75 is still 25% below the peak');
// rebase
ok(S.rebase([50, 100]).join() === '100,200' && S.sinceFirst([50, 100])[1] === 1, 'rebase and change since first');
const rp = S.rebasedPair({ d: ['2020-01-01', '2020-02-01'], c: [10, 20] }, { d: ['2020-01-01', '2020-02-01'], c: [100, 150] });
ok(rp.a[1] === 200 && rp.b[1] === 150, 'rebased pair starts both at 100');
process.exit(bad ? 1 : 0);
