// Trendlines and their alerts. node tests/lab-lines.test.mjs
import * as L from '../js/lab/lines.js';
import { rsi, sampleAt, toBars } from '../js/lab/series.js';
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } else console.log('ok  ', m); };
const lab = { lines: [] };
const id = L.addLine(lab, 'tcs', { d1: '2026-10-01', p1: 100, d2: '2026-10-11', p2: 110, color: '#00b8d4' });
ok(lab.lines.length === 1 && lab.lines[0].sym === 'TCS' && L.linesFor(lab, 'tcs').length === 1 && L.linesFor(lab, 'infy').length === 0, 'a line is stored per symbol, upper-cased');
ok(L.priceAt(lab.lines[0], 20 + Date.parse('2026-10-01') / 864e5) === 120 && L.priceAt(lab.lines[0], Date.parse('2026-09-21') / 864e5) === 90, 'the line carries on past both end points');
let threw = false; try { L.addLine(lab, 'X', { d1: 'bad', p1: 1, d2: '2026-01-01', p2: 2 }); } catch { threw = true; } ok(threw && lab.lines.length === 1, 'a line without valid dates is refused');
L.updateLine(lab, id, { color: '#e91e63', p2: 111.23456 });
ok(lab.lines[0].color === '#e91e63' && lab.lines[0].p2 === 111.2346, 'recolour and reshape; prices keep 4 decimals');
// alerts: a rising line 100 -> 110 over ten days (+1 a day); daily candles
const days = []; for (let i = 0; i < 20; i++) days.push(new Date(Date.parse('2026-10-01') + i * 864e5).toISOString().slice(0, 10));
const mk = (closes) => ({ d: days.slice(0, closes.length), o: closes, h: closes, l: closes, c: closes, v: closes.map(() => 1) });
const line = { id: 'a', sym: 'TCS', d1: '2026-10-01', p1: 100, d2: '2026-10-11', p2: 110, alert: { dir: 'above', bar: 'day', since: '2026-10-05' } };
const h1 = mk([95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 112, 113]);   // line at day 11 (index 10) = 110; close 105 is below it; index 11 close 112 vs line 111 -> above
const hit = L.checkAlert(line, h1, '2026-11-01');
ok(hit && hit.date === '2026-10-12' && hit.close === 112 && Math.round(hit.level) === 111, 'fires on the first finished candle that closes above the line');
ok(L.checkAlert(line, mk([95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105]), '2026-11-01') === null, 'no alert while price stays under the line');
ok(L.checkAlert({ ...line, alert: { ...line.alert, since: '2026-10-14' } }, h1, '2026-11-01') === null, 'candles from before the alert was set do not count');
ok(L.checkAlert(line, h1, '2026-10-13') && !L.checkAlert(line, mk([95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 112, 113]), '2026-10-13').date.startsWith('2026-10-13'), 'a day still in progress is not a finished candle');
ok(L.checkAlert({ ...line, alert: { ...line.alert, dismissed: '2026-10-12' } }, h1, '2026-11-01') === null || L.checkAlert({ ...line, alert: { ...line.alert, dismissed: '2026-10-12' } }, h1, '2026-11-01').date === '2026-10-13', 'a dismissed alert does not fire again for the same candle');
ok(L.checkAlert({ ...line, alert: { dir: 'below', bar: 'day', since: '2026-10-01' } }, h1, '2026-11-01').date === '2026-10-01', 'a below alert fires when a close is under the line');
const wk = { ...line, alert: { dir: 'above', bar: 'week', since: '2026-10-01' } };
ok(L.checkAlert(wk, h1, '2026-10-13') === null || L.checkAlert(wk, h1, '2026-10-13').bar === 'week', 'weekly alert only looks at finished weeks');
const lab2 = { lines: [line, { id: 'b', sym: 'INFY', d1: '2026-10-01', p1: 1, d2: '2026-10-02', p2: 1 }] };
ok(L.fired(lab2, (s) => (s === 'TCS' ? h1 : null), '2026-11-01').length === 1, 'fired(): only lines with an alert and history');
L.removeLine(lab2, 'a'); L.clearLines(lab2, 'infy'); ok(lab2.lines.length === 0, 'delete a line, clear a symbol');
// indicators
const r = rsi([...Array(20).keys()].map((i) => 100 + i), 14);
ok(r[13] === null && r[14] === 100 && r[19] === 100, 'RSI of a straight climb is 100');
const r2 = rsi([100, 101, 100, 101, 100, 101, 100, 101, 100, 101, 100, 101, 100, 101, 100, 101, 100], 14);
ok(r2[16] > 40 && r2[16] < 60, 'RSI of a zig-zag sits near 50');
const dly = { d: ['2026-10-26', '2026-10-27', '2026-10-30', '2026-11-02'], o: [1, 2, 3, 4], h: [1, 2, 3, 4], l: [1, 2, 3, 4], c: [1, 2, 3, 4], v: [0, 0, 0, 0] };
ok(sampleAt([10, 20, 30, 40], toBars(dly, 'week'), 4).join() === '30,40', 'a daily average is read at the last day of each week');
process.exit(bad ? 1 : 0);
