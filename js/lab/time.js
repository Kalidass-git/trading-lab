// Trading Lab: Indian market clock. Pure functions (no DOM). All times are Indian Standard Time (UTC+05:30).
const IST_MS = 5.5 * 36e5;
const DAY = 864e5;
/** Date (YYYY-MM-DD) in India at this moment. */
export const istDate = (nowMs) => new Date(nowMs + IST_MS).toISOString().slice(0, 10);
const istMinutes = (nowMs) => { const d = new Date(nowMs + IST_MS); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const istDay = (nowMs) => new Date(nowMs + IST_MS).getUTCDay();   // 0 Sunday
const OPEN = 9 * 60 + 15, CLOSE = 15 * 60 + 30;
/** Regular session: Monday to Friday, 9:15 to 15:30. Exchange holidays are not known, so a holiday looks like an open day. */
export const marketOpen = (nowMs) => { const d = istDay(nowMs), m = istMinutes(nowMs); return d >= 1 && d <= 5 && m >= OPEN && m < CLOSE; };
/** The moment of the most recent session close (15:30 on the latest weekday that has already closed). */
export function lastClose(nowMs) {
  let t = nowMs;
  for (let i = 0; i < 10; i++) {
    const close = Date.parse(istDate(t) + 'T15:30:00+05:30'), wd = istDay(close);
    if (wd >= 1 && wd <= 5 && close <= nowMs) return close;
    t -= DAY;
  }
  return nowMs;
}
/**
 * Are the saved prices out of date? Returns { level: 'never' | 'fresh' | 'stale', text }.
 * During the session prices older than 20 minutes are stale; outside it they are stale if they were taken before the last close.
 */
export function staleness(refreshedMs, nowMs) {
  if (!refreshedMs) return { level: 'never', text: 'Prices not fetched yet' };
  const age = nowMs - refreshedMs, mins = Math.round(age / 6e4);
  if (marketOpen(nowMs)) return mins > 20 ? { level: 'stale', text: `Prices are ${mins} minutes old and the market is open` } : { level: 'fresh', text: 'Prices are live' };
  if (refreshedMs < lastClose(nowMs)) return { level: 'stale', text: 'Prices were taken before the last market close' };
  return { level: 'fresh', text: 'Prices are from the last close' };
}
/** Expiry day ends at 15:30 IST. */
export const expiryMs = (expiry) => Date.parse(expiry + 'T15:30:00+05:30');
export const isExpired = (expiry, nowMs) => nowMs > expiryMs(expiry);
/** Whole calendar days from today (India) to the expiry date; 0 on the expiry day, negative after it. */
export const daysToExpiry = (expiry, nowMs) => Math.round((Date.parse(expiry + 'T00:00:00Z') - Date.parse(istDate(nowMs) + 'T00:00:00Z')) / DAY);
/** Years left to expiry for pricing (actual days over 365, to the 15:30 close), never below zero. */
export const yearsLeft = (expiry, nowMs) => Math.max(0, (expiryMs(expiry) - nowMs) / (365 * DAY));
