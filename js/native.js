// The Android app's bridge. In a browser or the installed web app (PWA) every function here does nothing, so the web app is unchanged.
// Capacitor puts `window.Capacitor` into the page only inside the Android app.
import { S, setCfg, subscribe, pull } from './store.js';
import { refreshPrices } from './refresh.js';
import { toast, h } from './ui.js';

const cap = () => window.Capacitor;
export const isNative = () => !!(cap() && cap().isNativePlatform && cap().isNativePlatform());
// This app has no bundler, so the plugins' own JavaScript is never loaded. Capacitor lets the page register a plugin by name instead:
// the call goes straight to the native side (App, SplashScreen, SystemBars and our own NativeTools).
const made = {};
const P = (name) => { if (!isNative() || !cap().registerPlugin) return null; try { return made[name] || (made[name] = cap().registerPlugin(name)); } catch { return null; } };

// ---------- haptics: one short tick on taps of tabs and buttons ----------
function ticks() {
  document.addEventListener('click', (e) => {
    if (e.target.closest && e.target.closest('.tabbar a, button, .seg button, [role="tab"]') && navigator.vibrate) navigator.vibrate(8);
  }, { passive: true });
}

// ---------- phone status bar: icon colour that can be read, and an optional full-screen mode ----------
let lastBars = '';
const hex2 = (n) => Number(n).toString(16).padStart(2, '0');
/** Dark icons on a light page, light icons on a dark page. Decided from what the page really shows, not from Android's night flag,
 *  because the app's own Light / Dark setting can differ from the phone's. The same colour is painted behind the bars. */
function statusBar() {
  const SB = P('SystemBars'), NT = P('NativeTools'); if (!SB && !NT) return;
  const hide = !!(S.cfg && S.cfg.hideStatusBar);
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(getComputedStyle(document.body).backgroundColor || '');
  const dark = m ? (0.299 * m[1] + 0.587 * m[2] + 0.114 * m[3]) < 128 : false;
  const color = m ? '#' + hex2(m[1]) + hex2(m[2]) + hex2(m[3]) : null;
  const key = (dark ? 'DARK' : 'LIGHT') + (color || '') + (hide ? '-hidden' : '');
  if (key === lastBars) return;
  lastBars = key;
  if (NT) NT.setBars({ dark, color }).catch(() => {});   // sets the icon colour directly on the window: the most reliable way
  if (SB) {
    SB.setStyle({ style: dark ? 'DARK' : 'LIGHT' }).catch(() => {});
    (hide ? SB.hide({ bar: 'StatusBar' }) : SB.show({ bar: 'StatusBar' })).catch(() => {});
  }
}

// ---------- pull down to refresh: latest Drive data, then share prices ----------
function pullToRefresh() {
  const dot = h('div', { class: 'ptr', 'aria-hidden': 'true' }, '↻');
  document.body.append(dot);
  let y0 = null, d = 0, busy = false;
  const reset = () => { dot.style.transform = ''; y0 = null; d = 0; };
  document.addEventListener('touchstart', (e) => { y0 = window.scrollY <= 0 && !busy && !document.querySelector('dialog[open]') && e.touches.length === 1 ? e.touches[0].clientY : null; }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (y0 == null) return;
    d = e.touches[0].clientY - y0;
    if (d <= 0) { reset(); return; }
    dot.style.transform = `translate(-50%, ${Math.min(d, 110) * 0.7 - 64}px) rotate(${d * 2}deg)`;
  }, { passive: true });
  document.addEventListener('touchend', async () => {
    const go = y0 != null && d > 90 && !!S.data;
    reset();
    if (!go) return;
    busy = true; dot.style.transform = 'translate(-50%, 8px)'; dot.classList.add('spin');
    try {
      if (S.remote && !S.meta.dirty) { try { await pull(); } catch { /* offline: carry on with prices */ } }
      await refreshPrices();
    } catch (e) { toast(e.message, 'bad'); }
    dot.classList.remove('spin'); dot.style.transform = ''; busy = false;
  }, { passive: true });
}

// ---------- the Android back button ----------
function backButton() {
  const App = P('App'); if (!App) return;
  App.addListener('backButton', () => {
    const open = [...document.querySelectorAll('dialog[open]')].pop();
    if (open) { open.close(); open.remove(); return; }
    const h0 = location.hash.replace(/^#\/?/, '');
    if (h0 && h0 !== 'dashboard') { if (history.length > 1) history.back(); else location.hash = '#/dashboard'; return; }
    App.exitApp();
  });
}

// ---------- files: print to PDF and share/save downloads ----------
const toBase64 = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(blob); });
function files() {
  const NT = P('NativeTools'); if (!NT) return;
  window.print = () => { NT.print({ title: 'Trading Lab' }).catch((e) => toast(e.message || 'Could not print', 'bad')); };
  // A WebView ignores <a download>. The app builds its backups and CSV files that way, so hand them to Android's share sheet instead.
  const real = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.download && /^blob:/.test(this.href)) {
      const name = this.download, href = this.href;
      fetch(href).then((r) => r.blob()).then(async (b) => { await NT.shareFile({ name, mime: b.type || 'application/octet-stream', data: await toBase64(b) }); })
        .catch((e) => toast((e && e.message) || 'Could not share the file', 'bad'));
      return;
    }
    return real.call(this);
  };
}

/** Call once at start-up. */
export function startNative() {
  if (!isNative()) return;
  document.documentElement.classList.add('native');
  // The phone screen is small: start one step smaller than the web app's normal size, once. Change it with Aa or in Settings.
  try { if (!localStorage.getItem('tl.fs.native')) { localStorage.setItem('tl.fs.native', '1'); if ((S.cfg.fontScale || 1) === 1) { setCfg({ fontScale: 0.9 }); document.documentElement.style.setProperty('--fs', 0.9); } } } catch { /* private mode */ }
  ticks(); pullToRefresh(); backButton(); files();
  subscribe(statusBar); statusBar();
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => setTimeout(statusBar, 100)); } catch { /* old WebView */ }
  setTimeout(statusBar, 800); setTimeout(statusBar, 2500);
  try { let t; new MutationObserver(() => { clearTimeout(t); t = setTimeout(statusBar, 60); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] }); } catch { /* old WebView */ }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { lastBars = ''; statusBar(); } });
  // keep the splash up until the first page has drawn, then fade it
  const SS = P('SplashScreen'); if (SS) requestAnimationFrame(() => setTimeout(() => SS.hide({ fadeOutDuration: 200 }).catch(() => {}), 150));
}
