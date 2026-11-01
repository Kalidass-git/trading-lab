import { VERSION } from './version.js';
import { S, init, subscribe, pull, setCfg, connect, resolveConflict } from './store.js';
import { h, $, toast, dialog, route } from './ui.js';
import { LAB, st, setAcct, activeAccounts, rerender, ago, selectOf, openStock } from './views/lab-shared.js';
import { ticket } from './views/lab-trade.js';
import { staleness } from './lab/time.js';
import * as MK from './lab/market.js';
import { refreshPrices, isRefreshing } from './refresh.js';
import * as dashboard from './views/dashboard.js';
import * as stocks from './views/stocks.js';
import * as stock from './views/stock.js';
import * as insights from './views/insights.js';
import * as baskets from './views/baskets.js';
import * as options from './views/options.js';
import * as reports from './views/reports.js';
import * as accounts from './views/accounts.js';
import * as settings from './views/settings.js';
import { startNative } from './native.js';

const ROUTES = {
  dashboard: { label: 'Dashboard', view: dashboard, icon: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z' },
  stocks: { label: 'Stocks', view: stocks, icon: 'M4 19V5M4 19h16M8 15l4-5 3 3 5-6' },
  stock: { label: 'Share', view: stock, hidden: true, parent: 'stocks', icon: 'M4 19V5M4 19h16M8 15l4-5 3 3 5-6' },
  baskets: { label: 'Baskets', view: baskets, icon: 'M4 8h16l-1.5 11a1 1 0 0 1-1 .9h-11a1 1 0 0 1-1-.9zM8 8a4 4 0 0 1 8 0' },
  options: { label: 'Options', view: options, icon: 'M5 18l5-12 4 8 5-6M3 21h18' },
  insights: { label: 'Insights', view: insights, icon: 'M12 3a6 6 0 0 0-3.5 10.9V17h7v-3.1A6 6 0 0 0 12 3zM9.5 20h5M10.5 22.5h3' },
  reports: { label: 'Reports', view: reports, icon: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7' },
  accounts: { label: 'Accounts', view: accounts, group: 'Manage', icon: 'M3 7h18v10H3zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z' },
  settings: { label: 'Settings', view: settings, group: 'Manage', icon: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM3 12h3m12 0h3M12 3v3m0 12v3' },
};
const TABS = ['dashboard', 'stocks', 'baskets', 'options', 'insights'];
const icon = (d) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'ico'); s.setAttribute('aria-hidden', 'true'); const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); s.append(p); return s; };
const SLIDERS = 'M14 6a2 2 0 1 0 4 0a2 2 0 1 0-4 0M4 6h10M18 6h2M6 12a2 2 0 1 0 4 0a2 2 0 1 0-4 0M4 12h2M10 12h10M13 18a2 2 0 1 0 4 0a2 2 0 1 0-4 0M4 18h9M17 18h3';
const FS = [0.8, 0.9, 1, 1.15, 1.3, 1.5];
const eye = (masked) => icon(masked ? 'M3 3l18 18M10.6 6.2A9.8 9.8 0 0 1 12 6c5 0 8.5 4 9.5 6a14 14 0 0 1-3 3.6M6.5 7.5C4.5 9 3.1 11 2.5 12c1 2 4.5 6 9.5 6 1.5 0 2.8-.4 4-.9M9.9 9.9a3 3 0 0 0 4.2 4.2' : 'M2.5 12C3.5 10 7 6 12 6s8.5 4 9.5 6c-1 2-4.5 6-9.5 6s-8.5-4-9.5-6zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z');
const routeName = () => { const r = route().name; return ROUTES[r] ? r : 'dashboard'; };

function shell() {
  $('#app').replaceChildren(
    h('a', { href: '#main', class: 'skip' }, 'Skip to content'),
    h('aside', { class: 'side', id: 'side' }),
    h('div', { class: 'main-col' }, h('header', { class: 'top', id: 'top' }), h('main', { id: 'main', tabindex: '-1' })),
    h('nav', { class: 'tabbar', id: 'tabbar', 'aria-label': 'Main' }));
}
const sideMin = () => { try { return localStorage.getItem('tl.side') === 'min'; } catch { return false; } };
function toggleSide() { const on = !$('#app').classList.contains('side-min'); $('#app').classList.toggle('side-min', on); try { localStorage.setItem('tl.side', on ? 'min' : 'full'); } catch { /* private mode */ } }
const renderView = () => render();

function conflictDialog() {
  dialog('Two devices changed the data', h('div', null,
    h('p', null, 'This device and Google Drive both have changes the app could not combine on its own. Choose which copy to keep.'),
    h('p', { class: 'note' }, 'Tip: trade on one device at a time, and wait for "Saved to Drive" before you switch.')),
    [{ label: 'Keep this device’s data', class: 'primary', onclick: async (c) => { c(); try { await resolveConflict('mine'); toast('Drive now has this device’s data'); } catch (e) { toast(e.message, 'bad'); } render(); } },
     { label: 'Use the Drive copy', class: 'danger', onclick: async (c) => { c(); try { await resolveConflict('drive'); toast('Loaded the Drive copy'); } catch (e) { toast(e.message, 'bad'); } render(); } },
     { label: 'Decide later', onclick: (c) => c() }]);
}

function chrome() {
  $('#app').classList.toggle('side-min', sideMin());
  const cur = routeName(), nav = ROUTES[cur].parent || cur, side = $('#side');
  side.replaceChildren(h('div', { class: 'brand' }, h('span', { class: 'mark', role: 'img', 'aria-label': 'Trading Lab' }), h('span', null, 'Trading Lab'),
    h('button', { class: 'side-toggle', type: 'button', 'aria-label': 'Collapse or expand the menu', title: 'Collapse or expand the menu', onclick: toggleSide }, icon('M15 6l-6 6 6 6'))));
  const list = h('ul'); let last = null;
  for (const [k, r] of Object.entries(ROUTES)) {
    if (r.hidden) continue;
    if (r.group && r.group !== last) list.append(h('li', { class: 'grp' }, r.group));
    last = r.group || null;
    list.append(h('li', null, h('a', { href: '#/' + k, class: k === nav ? 'on' : '', title: r.label, 'aria-label': r.label, 'aria-current': k === nav ? 'page' : null }, icon(r.icon), h('span', { class: 't' }, r.label))));
  }
  side.append(list, h('p', { class: 'ver' }, 'Version ' + VERSION));
  $('#tabbar').replaceChildren(...TABS.map((k) => h('a', { href: '#/' + k, class: k === nav ? 'on' : '', 'aria-current': k === nav ? 'page' : null }, icon(ROUTES[k].icon), h('span', null, ROUTES[k].label))));

  const stt = S.status;
  const info = S.saveFailed ? { text: 'Not saved on this device', kind: 'bad', href: '#/settings' }
    : !S.remote ? { text: 'This device only', kind: 'idle', icon: 'lock', title: 'Your data is on this device only' }
    : stt === 'syncing' ? { text: 'Syncing…', kind: 'busy' }
    : stt === 'conflict' ? { text: 'Fix sync', kind: 'bad', click: conflictDialog }
    : stt === 'error' || stt === 'offline' ? { text: stt === 'offline' ? 'Offline' : 'Sync problem', kind: 'bad', href: '#/settings' }
    : S.meta.dirty ? { text: 'Saving…', kind: 'busy' }
    : { text: 'Saved to Drive', kind: 'ok', icon: 'cloud', title: 'Your data is kept in your own Google Drive' };
  const props = { class: 'chip-status ' + (info.kind === 'bad' ? 'bad ' : info.kind === 'ok' ? 'ok ' : '') + (info.icon || ''), title: info.title || info.text };
  const chip = info.href ? h('a', { ...props, href: info.href }, info.text) : h(info.click ? 'button' : 'span', { ...props, ...(info.click ? { onclick: info.click } : {}) }, info.text);
  const dot = h(info.href ? 'a' : 'button', { class: 'sync-dot ' + info.kind, type: info.href ? null : 'button', href: info.href || null, 'aria-label': info.text, title: info.text, onclick: info.href ? null : (info.click || (() => toast(info.text))) });
  $('#top').replaceChildren(
    h('span', { class: 'mark top-mark', 'aria-hidden': 'true' }),
    h('div', { class: 'title' }, ROUTES[cur].group ? h('span', { class: 'crumb' }, ROUTES[cur].group) : null, h('h1', null, cur === 'stock' ? (decodeURIComponent(route().sub || '') || 'Share').toUpperCase() : ROUTES[cur].label)),
    h('div', { class: 'top-right' }, chip, dot,
      S.remote ? h('button', { class: 'icon refresh', 'aria-label': 'Refresh from Drive', title: 'Refresh from Drive', onclick: async () => { try { await pull(); } catch (e) { toast(e.message, 'bad'); } } }, '↻') : null,
      h('button', { class: 'icon eye', 'aria-label': S.masked ? 'Show figures' : 'Hide figures', title: S.masked ? 'Show figures' : 'Hide figures', 'aria-pressed': S.masked ? 'false' : 'true', onclick: () => { S.masked = !S.masked; render(); } }, eye(S.masked)),
      h('button', { class: 'icon aa', 'aria-label': 'Text size', title: 'Text size', onclick: () => { const i = FS.findIndex((f) => f >= (S.cfg.fontScale || 1) - 0.001); const n = FS[(i + 1) % FS.length]; setCfg({ fontScale: n }); document.documentElement.style.setProperty('--fs', n); toast('Text size ' + Math.round(n * 100) + '%'); } }, h('span', { class: 'aa-t' }, 'Aa')),
      h('a', { class: 'icon', href: '#/settings', 'aria-label': 'Settings' }, icon(SLIDERS))));
  document.documentElement.style.setProperty('--top-h', $('#top').offsetHeight + 'px');
  document.title = (cur === 'stock' ? decodeURIComponent(route().sub || '') || 'Share' : ROUTES[cur].label) + ' · Trading Lab';
}

/** Account switcher + price refresh, shown above every trading page. */
function labBar() {
  const lab = LAB(), accts = activeAccounts(lab);
  if (!accts.length) return null;
  const opts = [{ value: 'all', label: 'All accounts' }, ...accts.map((a) => ({ value: a.id, label: a.name }))];
  if (st.acct !== 'all' && !accts.some((a) => a.id === st.acct)) setAcct('all');
  const sel = selectOf(opts, st.acct, { 'aria-label': 'Account', onchange: (e) => { setAcct(e.target.value); rerender(); } });
  const at = MK.refreshedAt(), s = staleness(at, Date.now());
  const busy = isRefreshing();
  const known = new Map(); for (const t of lab.txns) if (t.symbol && !String(t.type).startsWith('o')) known.set(String(t.symbol).toUpperCase(), t.name || t.symbol); for (const w of lab.watchlists || []) for (const i of w.items || []) known.set(i.symbol, i.name || i.symbol);
  const find = h('input', { type: 'search', class: 'lab-find', placeholder: 'Search a share, e.g. RELIANCE', 'aria-label': 'Open a share', list: 'lab-find-list', autocapitalize: 'characters', autocomplete: 'off' });
  const go = () => { const v = find.value.trim().toUpperCase(); if (!v) return; if (!/^[A-Z0-9.&^=\-]{1,25}$/.test(v)) return toast('Enter a share symbol such as RELIANCE or TCS.', 'bad'); find.value = ''; openStock(v); };
  find.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
  find.addEventListener('change', go);
  return h('div', { class: 'lab-bar' }, h('datalist', { id: 'lab-find-list' }, [...known].map(([k, v]) => h('option', { value: k }, v))), sel, find,
    h('button', { class: 'refresh-btn' + (busy ? ' spin' : ''), type: 'button', disabled: busy, onclick: () => refreshPrices(), title: 'Fetch the latest prices for everything you hold or watch. Nothing is fetched until you press this.' }, busy ? 'Refreshing…' : 'Refresh prices'),
    h('button', { class: 'primary lab-trade-btn', type: 'button', onclick: () => ticket() }, 'Buy / Sell'),
    h('span', { class: 'stamp ' + (s.level === 'fresh' ? '' : 'stale'), role: 'status' }, at ? `Updated ${ago(at)}. ${s.level === 'fresh' ? '' : s.text + '.'}` : s.text + '.'));
}

const NEG = /^\s*[-−–]\s?₹|^\s*[-−]\d|^\s*[-−]\s?[\d.,]+\s?(L|Cr|K|%)/;
function markNegatives(root) {
  for (const el of root.querySelectorAll('td, .stat-value, .rl-val, .kpi-value, .gain, strong, .chip-btn')) {
    if (el.children.length > 1) continue;
    const t = el.textContent || '';
    if (t.length < 30 && NEG.test(t)) el.classList.add('neg');
  }
}

let rendering = false, shown = false;
function render() {
  if (rendering) return; rendering = true;
  try {
    if (!shown) { $('#app').className = ''; shell(); shown = true; }
    chrome();
    const cur = routeName(), main = $('#main');
    const y = window.scrollY;
    const page = ROUTES[cur].view.render();
    main.replaceChildren(...[cur === 'settings' ? null : labBar(), page].filter(Boolean));
    markNegatives(main);
    const where = cur + '/' + route().sub;
    if (window.__lastRoute === where) window.scrollTo(0, y); else { window.scrollTo(0, 0); window.__lastRoute = where; }
  } catch (e) {
    console.error(e);
    $('#main').replaceChildren(h('div', { class: 'page' }, h('div', { class: 'card' }, h('h2', null, 'Something went wrong showing this page'), h('p', null, e.message), h('p', { class: 'note' }, 'Your data is safe. Go back to the Dashboard or reload the app.'))));
  } finally { rendering = false; }
}

// A link like  index.html#/dashboard?u=<backend>&k=<key>  connects this device in one tap.
function autoConnect() {
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const u = q.get('u'), k = q.get('k');
  if (!u || !k || S.remote) return;
  history.replaceState(null, '', location.pathname + '#/dashboard');
  connect(u.trim(), k.trim()).then(() => pull({ force: true })).then(() => { toast('Connected to Google Drive'); render(); }).catch((e) => toast(e.message, 'bad'));
}

// ---------- boot ----------
init();
document.documentElement.style.setProperty('--fs', S.cfg.fontScale || 1);
document.documentElement.dataset.theme = S.cfg.theme === 'auto' ? '' : (S.cfg.theme || '');
window.addEventListener('hashchange', render);
window.addEventListener('rerender', render);
let t;
subscribe(() => { clearTimeout(t); t = setTimeout(() => { if (S.data) render(); }, 30); });
autoConnect();
render();
window.addEventListener('beforeunload', (e) => { if (S.meta && S.meta.dirty && S.remote) { e.preventDefault(); e.returnValue = ''; } });
if (S.remote) pull().catch(() => {});
window.addEventListener('online', () => S.remote && pull().catch(() => {}));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.remote && !S.meta.dirty) pull().catch(() => {}); });
startNative();
if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())) navigator.serviceWorker.register('./sw.js').catch(() => {});
