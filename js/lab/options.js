// Trading Lab: option valuation. Pure functions. A premium you type in always wins; otherwise value is estimated with Black-Scholes
// from the live price of the underlying (an estimate, not a market quote), and after expiry it is the intrinsic value.
import { isExpired, yearsLeft } from './time.js';

/** Standard normal cumulative distribution (Hart's algorithm, double precision). */
export function normCdf(x) {
  const a = Math.abs(x);
  let c;
  if (a > 37) c = 0;
  else {
    const e = Math.exp(-a * a / 2);
    if (a < 7.07106781186547) {
      let b = 3.52624965998911e-2 * a + 0.700383064443688;
      b = b * a + 6.37396220353165; b = b * a + 33.912866078383; b = b * a + 112.079291497871; b = b * a + 221.213596169931; b = b * a + 220.206867912376;
      c = e * b;
      b = 8.83883476483184e-2 * a + 1.75566716318264;
      b = b * a + 16.064177579207; b = b * a + 86.7807322029461; b = b * a + 296.564248779674; b = b * a + 637.333633378831; b = b * a + 793.826512519948; b = b * a + 440.413735824752;
      c = c / b;
    } else {
      let b = a + 0.65; b = a + 4 / b; b = a + 3 / b; b = a + 2 / b; b = a + 1 / b;
      c = e / b / 2.506628274631;
    }
  }
  return x > 0 ? 1 - c : c;
}
export const intrinsic = (kind, spot, strike) => Math.max(0, kind === 'call' ? spot - strike : strike - spot);
/** Black-Scholes price per unit. T in years, r and sigma as fractions (0.07, 0.2). */
export function blackScholes(kind, S, K, T, r, sigma) {
  if (!(S > 0) || !(K > 0)) return null;
  if (!(T > 0) || !(sigma > 0)) return intrinsic(kind, S, K);
  const sq = sigma * Math.sqrt(T), d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / sq, d2 = d1 - sq, disc = Math.exp(-r * T);
  return kind === 'call' ? S * normCdf(d1) - K * disc * normCdf(d2) : K * disc * normCdf(-d2) - S * normCdf(-d1);
}
/**
 * Current premium of an option position. position = { kind, strike, expiry, underlying }, spot = underlying price or null,
 * mark = { premium, iv } typed by you or null, settings = { iv, rate }.
 * Returns { premium, source: 'manual' | 'model' | 'intrinsic' } or null when nothing can be worked out.
 */
export function optionPremium(position, spot, mark, settings, nowMs) {
  const exp = isExpired(position.expiry, nowMs);
  if (exp) return spot > 0 ? { premium: intrinsic(position.kind, spot, position.strike), source: 'intrinsic' } : mark && mark.premium >= 0 ? { premium: Number(mark.premium), source: 'manual' } : null;
  if (mark && mark.premium != null && mark.premium !== '' && Number(mark.premium) >= 0) return { premium: Number(mark.premium), source: 'manual' };
  if (!(spot > 0)) return null;
  const iv = mark && Number(mark.iv) > 0 ? Number(mark.iv) : (settings && settings.iv) || 0.2, r = settings && settings.rate != null ? settings.rate : 0.07;
  return { premium: Math.round(blackScholes(position.kind, spot, position.strike, yearsLeft(position.expiry, nowMs), r, iv) * 100) / 100, source: 'model' };
}
export const breakeven = (kind, strike, premium) => (kind === 'call' ? strike + premium : strike - premium);
