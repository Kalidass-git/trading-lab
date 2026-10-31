// Trading Lab: market clock, option expiry and Black-Scholes. node tests/lab-options.test.mjs
import * as T from '../js/lab/time.js';
import * as O from '../js/lab/options.js';
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } else console.log('ok  ', m); };
const at = (s) => Date.parse(s);
// 2026-10-30 is a Friday
ok(T.istDate(at('2026-10-30T20:00:00Z')) === '2026-10-31', '20:00 UTC is already the next day in India');
ok(T.marketOpen(at('2026-10-30T04:00:00Z')) && !T.marketOpen(at('2026-10-30T10:30:00Z')), 'open at 09:30 IST, closed at 16:00 IST');
ok(!T.marketOpen(at('2026-10-31T05:00:00Z')), 'closed on Saturday');
ok(T.lastClose(at('2026-11-01T06:00:00Z')) === at('2026-10-30T15:30:00+05:30'), 'on a Sunday the last close was Friday 15:30');
const now = at('2026-10-30T05:00:00Z');   // Friday 10:30 IST
ok(T.staleness(null, now).level === 'never', 'no refresh yet');
ok(T.staleness(now - 5 * 6e4, now).level === 'fresh' && T.staleness(now - 25 * 6e4, now).level === 'stale', 'in the session, 20 minutes is the limit');
ok(T.staleness(at('2026-10-30T10:30:00Z'), at('2026-10-31T06:00:00Z')).level === 'fresh', 'a refresh after Friday’s close is fresh on Saturday');
ok(T.staleness(at('2026-10-30T08:00:00Z'), at('2026-10-31T06:00:00Z')).level === 'stale', 'a refresh at 13:30 on Friday is before the close, so stale on Saturday');
ok(T.daysToExpiry('2026-11-02', at('2026-10-30T20:00:00Z')) === 2, 'days to expiry count in India’s date (Saturday there, so 2 days to Monday)');
ok(T.daysToExpiry('2026-10-30', now) === 0 && T.daysToExpiry('2026-10-29', now) === -1, 'zero on the expiry day, negative after');
ok(!T.isExpired('2026-10-30', at('2026-10-30T09:59:00Z')) && T.isExpired('2026-10-30', at('2026-10-30T10:01:00Z')), 'an option lives until 15:30 on its expiry day');
// Black-Scholes reference values
ok(Math.abs(O.normCdf(0) - 0.5) < 1e-12 && Math.abs(O.normCdf(1.96) - 0.9750021) < 1e-6 && Math.abs(O.normCdf(-1) - 0.1586553) < 1e-6, 'normal distribution');
const call = O.blackScholes('call', 100, 100, 1, 0.05, 0.2), put = O.blackScholes('put', 100, 100, 1, 0.05, 0.2);
ok(Math.abs(call - 10.4506) < 1e-3 && Math.abs(put - 5.5735) < 1e-3, 'textbook call 10.4506 and put 5.5735');
ok(Math.abs(call - put - (100 - 100 * Math.exp(-0.05))) < 1e-9, 'put-call parity holds');
ok(O.blackScholes('call', 120, 100, 0, 0.05, 0.2) === 20 && O.blackScholes('put', 120, 100, 0, 0.05, 0.2) === 0, 'at expiry it is the intrinsic value');
const pos = { kind: 'call', strike: 25000, expiry: '2026-11-25', underlying: 'NIFTY' }, st = { iv: 0.15, rate: 0.07 };
ok(O.optionPremium(pos, 25000, { premium: 321 }, st, now).source === 'manual' && O.optionPremium(pos, 25000, { premium: 321 }, st, now).premium === 321, 'a premium you type wins');
const m = O.optionPremium(pos, 25000, null, st, now);
ok(m.source === 'model' && m.premium > 300 && m.premium < 1000, 'otherwise it is estimated from the underlying');
ok(O.optionPremium(pos, null, null, st, now) === null, 'no underlying price and no premium: no value (shown at cost)');
const after = at('2026-11-26T05:00:00Z');
ok(O.optionPremium(pos, 25400, { premium: 999 }, st, after).premium === 400 && O.optionPremium(pos, 25400, null, st, after).source === 'intrinsic', 'after expiry only intrinsic value counts');
ok(O.optionPremium({ ...pos, kind: 'put' }, 25400, null, st, after).premium === 0, 'an out-of-the-money put expires worthless');
ok(O.breakeven('call', 25000, 300) === 25300 && O.breakeven('put', 25000, 300) === 24700, 'break-even levels');
console.log(bad ? bad + ' failed' : 'all passed'); process.exit(bad ? 1 : 0);
