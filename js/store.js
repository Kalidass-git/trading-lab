// Trading Lab: app state, local saving and sync with this app's own Google Drive file (backend/Code.gs).
// One key opens everything, so there is no owner / family split: every device that has the key can trade.
// The data is one document: { v, accounts, txns, watchlists, baskets, marks, snaps, settings, updatedAt }.
import * as remote from './remote.js';
import { merge } from './merge.js';
import { emptyLab } from './lab/model.js';

const K = { data: 'tl.data', cfg: 'tl.cfg', meta: 'tl.meta', base: 'tl.base' };
const read = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); if (k === K.data) S.saveFailed = false; return true; } catch { if (k === K.data) S.saveFailed = true; return false; } };

export const S = {
  saveFailed: false,
  data: null,
  cfg: { backendUrl: '', key: '', theme: 'auto', fontScale: 1 },
  masked: false,           // figures are shown; the eye icon hides them (resets on every app open)
  role: 'owner',           // always: one key, full access (kept so the shared UI helpers work unchanged)
  remote: false,           // true when a backend is configured
  meta: { version: 0, dirty: false, lastSync: null },
  status: 'idle',          // idle | syncing | error | offline | conflict
  error: '',
  lastMerge: null,
  all: null,               // not used here; the shared helpers look at it
};
const listeners = new Set();
export const subscribe = (fn) => (listeners.add(fn), () => listeners.delete(fn));
const emit = () => listeners.forEach((fn) => fn(S));

export function init() {
  S.cfg = { ...S.cfg, ...read(K.cfg, {}) };
  S.meta = { ...S.meta, ...read(K.meta, {}) };
  S.data = read(K.data, null);
  S.remote = !!(S.cfg.backendUrl && S.cfg.key);
  // a first run on a device with no backend still works: the data starts empty and stays on this device
  if (!S.data) { S.data = { ...emptyLab(), updatedAt: new Date().toISOString() }; write(K.data, S.data); }
  if (!S.meta.dirty && !localStorage.getItem(K.base)) saveBase(S.data);
  return S;
}
export function setCfg(patch) {
  S.cfg = { ...S.cfg, ...patch };
  write(K.cfg, S.cfg);
  S.remote = !!(S.cfg.backendUrl && S.cfg.key);
  emit();
}
export function setData(data, { dirty = false, version } = {}) {
  S.data = data;
  if (version != null) S.meta.version = version;
  S.meta.dirty = dirty;
  write(K.data, data); write(K.meta, S.meta);
  if (!dirty) saveBase(data);
  emit();
}
const saveBase = (d) => { if (!write(K.base, d)) { try { localStorage.removeItem(K.base); } catch { /* ignore */ } } };
const loadBase = () => read(K.base, null);

/** Structural check: refuse to save or upload something that is not a Trading Lab file. */
export function sanity(d) {
  const bad = [];
  if (!d || typeof d !== 'object') return ['data is empty'];
  for (const k of ['accounts', 'txns', 'watchlists', 'baskets']) if (!Array.isArray(d[k])) bad.push(k + ' is missing');
  if (!bad.length) {
    const ids = new Set(); let dup = 0;
    for (const t of d.txns) { if (ids.has(t.id)) dup++; ids.add(t.id); }
    if (dup) bad.push(dup + ' transactions share an id');
    const acct = new Set(d.accounts.map((a) => a.id));
    if (d.txns.some((t) => !acct.has(t.acct))) bad.push('a transaction belongs to a missing account');
  }
  return bad;
}
export const validData = (d) => sanity(d).length === 0;

/**
 * Apply a change to the data and save it. If `fn` throws, the data is put back exactly as it was and the error is passed on.
 * Saves on this device straight away and uploads to Drive a moment later.
 */
export function commit(fn) {
  const before = JSON.stringify(S.data);
  try {
    fn(S.data);
    const bad = sanity(S.data);
    if (bad.length) throw new Error('That change would have damaged the data (' + bad[0] + '), so it was cancelled.');
  } catch (e) { S.data = JSON.parse(before); emit(); throw e; }
  S.data.updatedAt = new Date().toISOString();
  S.meta.dirty = true;
  write(K.data, S.data); write(K.meta, S.meta);
  emit();
  schedulePush(1500);
}

let pushTimer = null, pushPending = false, retryTimer = null, retryN = 0, flight = null, pullFlight = null;
function schedulePush(ms = 1500) {
  if (!S.remote) return;
  clearTimeout(pushTimer); pushPending = true;
  pushTimer = setTimeout(() => { pushPending = false; push().catch(() => {}); }, ms);
}
function retryLater() {
  clearTimeout(retryTimer);
  if (!S.meta.dirty || !S.remote) return;
  const ms = Math.min(300000, 10000 * 2 ** Math.min(retryN++, 5));
  pushPending = true;
  retryTimer = setTimeout(() => { pushPending = false; if (S.meta.dirty) push().catch(() => {}); }, ms);
}
export const isSaving = () => !!flight || pushPending;
export function kick() { if (S.remote && S.meta.dirty && !flight) { clearTimeout(retryTimer); retryN = 0; schedulePush(300); } }

export async function connect(url, key) {
  const res = await remote.call(url, key, 'auth');
  S.cfg = { ...S.cfg, backendUrl: url, key };
  write(K.cfg, S.cfg);
  S.remote = true;
  emit();
  return res;
}

export async function pull(opts = {}) {
  if (!S.remote) return;
  if (flight) await flight.catch(() => {});
  if (pullFlight) return pullFlight;
  pullFlight = doPull(opts).finally(() => { pullFlight = null; });
  return pullFlight;
}
async function doPull({ force = false } = {}) {
  S.status = 'syncing'; emit();
  try {
    const res = await remote.call(S.cfg.backendUrl, S.cfg.key, 'read');
    if (S.meta.dirty && !force) {
      if (res.version !== S.meta.version) return reconcile(res);
      return doPush();
    }
    if (!res.data) {                       // a brand new Drive file: upload what this device has (if anything)
      S.status = 'idle'; emit();
      if (S.data && (S.data.accounts.length || S.data.watchlists.length)) { S.meta.dirty = true; return doPush(); }
      return { empty: true };
    }
    if (!validData(res.data)) throw new Error('The Drive file does not look like Trading Lab data, so it was not loaded.');
    setData(res.data, { dirty: false, version: res.version });
    S.meta.lastSync = new Date().toISOString(); write(K.meta, S.meta);
    S.status = 'idle'; S.error = ''; emit();
    return { ok: true };
  } catch (e) { return fail(e); }
}
function fail(e) {
  S.error = e.message || String(e);
  S.status = /reach|took too long/i.test(S.error) ? 'offline' : 'error';
  emit(); retryLater();
  return { error: S.error };
}

export function push(opts = {}) {
  if (!S.remote) return Promise.resolve();
  if (flight) return flight;
  flight = doPush(opts).finally(() => { flight = null; });
  return flight;
}
async function doPush({ force = false } = {}) {
  S.status = 'syncing'; emit();
  try {
    const bad = sanity(S.data);
    if (bad.length) { S.status = 'error'; S.error = 'Not uploaded because the data looks damaged: ' + bad[0] + '. Restore a backup in Settings.'; emit(); return { blocked: true }; }
    const sent = JSON.stringify(S.data);
    const res = await remote.call(S.cfg.backendUrl, S.cfg.key, 'write', { data: S.data, baseVersion: force ? null : S.meta.version });
    if (res.conflict) return reconcile();
    try { if (!write(K.base, JSON.parse(sent))) localStorage.removeItem(K.base); } catch { /* ignore */ }
    S.meta.version = res.version; S.meta.dirty = JSON.stringify(S.data) !== sent; S.meta.lastSync = new Date().toISOString();
    write(K.meta, S.meta);
    S.status = 'idle'; S.error = ''; retryN = 0; emit();
    return { ok: true };
  } catch (e) { return fail(e); }
}

/** Another device saved first. Combine both sets of changes and upload the result. */
async function reconcile(remoteRes) {
  const res = remoteRes || await remote.call(S.cfg.backendUrl, S.cfg.key, 'read');
  const base = loadBase();
  if (!res.data || !base) { S.status = 'conflict'; emit(); return { conflict: true, remote: res }; }
  const m = merge(base, S.data, res.data);
  if (!validData(m.data)) { S.status = 'conflict'; emit(); return { conflict: true, remote: res }; }
  m.data.updatedAt = new Date().toISOString();
  S.data = m.data; S.meta.version = res.version; S.meta.dirty = true;
  write(K.data, S.data); write(K.meta, S.meta);
  S.lastMerge = { at: Date.now(), clashes: m.clashes, fromRemote: m.fromRemote };
  emit();
  const r = await doPush();
  return r && r.ok ? { ok: true, merged: S.lastMerge } : r;
}
export async function resolveConflict(choice) { return choice === 'mine' ? push({ force: true }) : pull({ force: true }); }

/** Replace everything with a backup file's data and upload it. */
export async function restoreData(d) {
  if (!validData(d)) throw new Error('That file does not look like Trading Lab data, so nothing was changed.');
  if (flight) await flight.catch(() => {});
  clearTimeout(pushTimer); clearTimeout(retryTimer); pushPending = false;
  S.data = JSON.parse(JSON.stringify(d)); S.data.updatedAt = new Date().toISOString();
  S.meta.dirty = true; S.error = ''; if (S.status === 'error') S.status = 'idle';
  write(K.data, S.data); write(K.meta, S.meta); emit();
  if (!S.remote) { S.meta.dirty = false; write(K.meta, S.meta); return { local: true }; }
  return (await push({ force: true })) || { pending: true };
}
export function disconnect() {
  S.cfg = { ...S.cfg, backendUrl: '', key: '' };
  write(K.cfg, S.cfg); S.remote = false; emit();
}
export function resetAll() {
  Object.values(K).forEach((k) => { try { localStorage.removeItem(k); } catch { /* ignore */ } });
  for (const k of ['lab.quotes', 'lab.refreshedAt', 'tl.side']) { try { localStorage.removeItem(k); } catch { /* ignore */ } }
  location.hash = '#/dashboard'; location.reload();
}
