// Trading Lab: the one place that fetches prices, so every screen and the pull-down gesture behave the same.
import { S } from './store.js';
import * as MK from './lab/market.js';
import { toast } from './ui.js';
import { snap } from './views/lab-trade.js';

let busy = false;
export const isRefreshing = () => busy;
/** Fetch prices for every share, basket and option underlying in use, save a daily reading, tell the person what happened. */
export async function refreshPrices({ quiet = false } = {}) {
  if (busy) return null;
  busy = true; window.dispatchEvent(new Event('rerender'));
  try {
    const r = await MK.refresh(S.data);
    if (r.none) { if (!quiet) toast('Nothing to price yet. Add a trade or a watchlist share first.'); return r; }
    try { snap(); } catch { /* the daily reading is a convenience */ }
    if (!quiet) toast(r.errors.length ? `Updated ${r.got} of ${r.total}. ${r.errors.length} issue${r.errors.length > 1 ? 's' : ''}: ${r.errors[0]}` : `Updated ${r.got} price${r.got === 1 ? '' : 's'}`, r.errors.length ? 'bad' : '');
    return r;
  } catch (e) { if (!quiet) toast(e.message, 'bad'); return null; }
  finally { busy = false; window.dispatchEvent(new Event('rerender')); }
}
