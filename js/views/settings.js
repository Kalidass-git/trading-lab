// Trading Lab: settings. Backend connection, look, backup and restore.
import { S, setCfg, connect, pull, push, disconnect, resetAll, restoreData, validData } from '../store.js';
import { VERSION, RELEASED } from '../version.js';
import { h, section, btn, formDialog, dialog, confirmDialog, toast, rowList, setOptions } from '../ui.js';
import { LAB, rerender, download, ago } from './lab-shared.js';

export { validData };
const FS = [0.8, 0.9, 1, 1.15, 1.3, 1.5];
function connectForm() {
  formDialog({ title: 'Connect to Google Drive backend', saveLabel: 'Connect', value: { url: S.cfg.backendUrl, key: S.cfg.key },
    fields: [{ key: 'url', label: 'Backend URL', type: 'text', required: true, hint: 'The /exec address from your Apps Script deployment.' }, { key: 'key', label: 'Access key', type: 'text', required: true }],
    onSave: (v) => {
      connect(v.url.trim(), v.key.trim()).then(async () => { toast('Connected'); try { const r = await pull(); if (r && r.error) toast(r.error, 'bad'); } catch (e) { toast(e.message, 'bad'); } rerender(); }).catch((e) => toast(e.message, 'bad'));
    } });
}
export function render() {
  const root = h('div', { class: 'page' }), lab = LAB();
  const status = !S.remote ? 'Not connected: your data is on this device only.' : S.status === 'error' || S.status === 'offline' ? 'Sync problem: ' + S.error : S.meta.dirty ? 'Saving to Drive…' : 'Saved to Drive' + (S.meta.lastSync ? ' · ' + ago(Date.parse(S.meta.lastSync)) : '');
  root.append(section('Google Drive backend', h('div', null, h('p', null, status),
    h('p', { class: 'note' }, 'Your trades are kept in your own Google Drive file (Trading Lab Data). One key opens everything. Prices are fetched through the same backend.')),
    [btn(S.remote ? 'Change connection' : 'Connect', connectForm, S.remote ? '' : 'primary'), S.remote ? btn('Sync now', async () => { try { const r = await (S.meta.dirty ? push() : pull()); toast(r && r.error ? r.error : 'Up to date', r && r.error ? 'bad' : ''); } catch (e) { toast(e.message, 'bad'); } rerender(); }) : null,
      S.remote ? btn('Disconnect', async () => { if (await confirmDialog('Disconnect from the backend? Your data stays on this device and in Drive.', 'Disconnect')) { disconnect(); rerender(); } }) : null]));
  const theme = h('select', { 'aria-label': 'Theme', onchange: (e) => { setCfg({ theme: e.target.value }); document.documentElement.dataset.theme = e.target.value === 'auto' ? '' : e.target.value; } });
  setOptions(theme, [{ value: 'auto', label: 'Match my phone' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }], S.cfg.theme || 'auto');
  const fs = h('select', { 'aria-label': 'Text size', onchange: (e) => { setCfg({ fontScale: Number(e.target.value) }); document.documentElement.style.setProperty('--fs', e.target.value); } });
  setOptions(fs, FS.map((v) => ({ value: v, label: Math.round(v * 100) + '%' })), S.cfg.fontScale || 1);
  root.append(section('Look', h('div', { class: 'form' }, h('label', { class: 'field' }, h('span', null, 'Theme'), theme), h('label', { class: 'field' }, h('span', null, 'Text size'), fs))));
  root.append(section('Backup', h('div', null, h('p', { class: 'note' }, 'Drive keeps a daily copy for 30 days. You can also save a file of everything here, and load it back later.')),
    [btn('Download backup', () => { download(`trading-lab-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(S.data, null, 1), 'application/json'); toast('Backup downloaded'); }, 'primary'),
      h('label', { class: 'btn', for: 'tl-restore' }, 'Restore from file'), h('input', { type: 'file', id: 'tl-restore', accept: '.json,application/json', class: 'sr-only', onchange: async (e) => {
        const file = e.target.files[0]; e.target.value = ''; if (!file) return;
        try { const d = JSON.parse(await file.text()); if (!validData(d)) throw new Error('That is not a Trading Lab backup file.');
          if (!(await confirmDialog(`Replace everything with this backup (${d.accounts.length} accounts, ${d.txns.length} transactions)? Your current data will be overwritten.`, 'Replace'))) return;
          const r = await restoreData(d); toast(r && r.error ? 'Restored on this device. ' + r.error : 'Restored'); rerender();
        } catch (err) { toast(err.message || 'Could not read that file', 'bad'); } } })]));
  root.append(section('About', h('div', null, rowList([{ title: 'Trading Lab', sub: 'Paper trading: all money, trades and prices are virtual and do not touch real accounts.', value: 'v' + VERSION, valueSub: RELEASED },
    { title: 'Stored here', sub: `${lab.accounts.length} accounts · ${lab.txns.length} transactions · ${lab.watchlists.length} watchlists · ${lab.baskets.length} baskets` }])),
    [btn('Erase data on this device', async () => { if (await confirmDialog('Erase everything saved on this device, including the connection? Data in Google Drive is not touched.', 'Erase')) resetAll(); })]));
  return root;
}
