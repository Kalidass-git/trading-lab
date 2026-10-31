// Small DOM and formatting helpers shared by every screen.
import { S } from './store.js';
import { sortFilterBar } from './mobilebar.js';

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v; // only used with trusted, static markup
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; } }
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
export const $ = (sel, root = document) => root.querySelector(sel);

/** Current route from the address bar: #/cash/ledger?x=1 -> { name:'cash', sub:'ledger', query } */
export function route() {
  const [path, q] = location.hash.replace(/^#\/?/, '').split('?');
  const [name, sub] = path.split('/');
  return { name: name || 'home', sub: sub || '', query: new URLSearchParams(q || '') };
}
/** Tabs inside a page (second level). Real links, so the back button and a page refresh keep your place. */
export function segTabs(items, current, label = 'Sections') {
  const { name } = route();
  return h('nav', { class: 'seg', role: 'tablist', 'aria-label': label },
    items.map(([k, l]) => h('a', { href: `#/${name}/${k}`, role: 'tab', 'aria-selected': k === current ? 'true' : 'false', class: k === current ? 'on' : '' }, l)));
}
/** Pick the active sub tab from the address, falling back to the first one. */
export const subTab = (keys) => { const s = route().sub; return keys.includes(s) ? s : keys[0]; };

// ---------- formatting ----------
const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MASK = '₹ ••••';
/** Figures are shown unless the eye icon was tapped (S.masked is false each time the app opens). */
export const isMasked = () => S.masked === true;
export const money = (n) => (n == null || isNaN(n) ? '–' : isMasked() ? MASK : (n < 0 ? '-' : '') + '₹' + inr.format(Math.abs(Math.round(n))));
export const num = (n, d = 0) => (n == null || isNaN(n) ? '–' : d ? inr2.format(n).replace(/\.00$/, d === 2 ? '.00' : '') : inr.format(n));
export const dec = (n, d = 2) => (n == null || isNaN(n) ? '–' : new Intl.NumberFormat('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n));
/** 1.23 Cr / 4.5 L / 12,300 */
export function compact(n) {
  if (n == null || isNaN(n)) return '–';
  if (isMasked()) return MASK;
  const a = Math.abs(n), s = n < 0 ? '-' : '';
  if (a >= 1e7) return `${s}₹${(a / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `${s}₹${(a / 1e5).toFixed(2)} L`;
  return money(n);
}
export const pct = (n, d = 1) => (n == null || isNaN(n) ? '–' : (n * 100).toFixed(d) + '%');
export const signed = (n, f = money) => (n > 0 ? '+' : '') + f(n);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const dateStr = (s) => (s ? `${Number(s.slice(8, 10))} ${MON[Number(s.slice(5, 7)) - 1]} ${s.slice(0, 4)}` : '–');
export const monthLabel = (m, long = false) => `${long ? ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][Number(m.slice(5, 7)) - 1] : MON[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
export const posNeg = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');
export const gainText = (n, f = money) => h('span', { class: posNeg(n) }, (n > 0 ? '▲ ' : n < 0 ? '▼ ' : '') + f(Math.abs(n)));
export const canEdit = () => S.role === 'owner';

// ---------- toast ----------
let toastTimer;
export function toast(msg, kind = '') {
  let t = $('#toast');
  if (!t) { t = h('div', { id: 'toast', role: 'status' }); document.body.append(t); }
  t.textContent = msg; t.className = 'show ' + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = ''), kind === 'bad' ? 6000 : 2600);
}

// ---------- dialogs ----------
export function dialog(title, body, actions = []) {
  const dlg = h('dialog', { class: 'sheet' });
  const close = () => { dlg.close(); dlg.remove(); };
  dlg.append(
    h('header', null, h('h2', null, title), h('button', { class: 'icon', 'aria-label': 'Close', onclick: close }, '✕')),
    h('div', { class: 'dlg-body' }, body),
    ...(actions.length ? [h('footer', null, actions.map((a) => h('button', { class: a.class || '', onclick: () => a.onclick(close) }, a.label)))] : []),
  );
  dlg.addEventListener('cancel', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  return { close, el: dlg };
}
export function confirmDialog(message, okLabel = 'Delete') {
  return new Promise((res) => {
    dialog('Please confirm', h('div', null, message && message.nodeType ? message : h('p', null, message)), [
      { label: 'Cancel', onclick: (c) => (c(), res(false)) },
      { label: okLabel, class: 'danger', onclick: (c) => (c(), res(true)) },
    ]);
  });
}

/** Fill a <select>. options: ['a', {value,label}, {group:'Name', options:[...]}] */
export function setOptions(sel, options, value) {
  const opt = (o) => {
    const ov = typeof o === 'object' ? o.value : o, ol = typeof o === 'object' ? o.label : o;
    return h('option', { value: ov, selected: String(ov) === String(value) }, ol);
  };
  sel.replaceChildren(...options.map((o) => (o && o.group ? h('optgroup', { label: o.group }, o.options.map(opt)) : opt(o))));
  if (![...sel.options].some((o) => o.selected) && sel.options.length) sel.selectedIndex = 0;
}

/**
 * Form dialog. fields: [{key,label,type:'text'|'number'|'date'|'select'|'textarea'|'checkbox', options, required, step, hint, half, showIf(values)}]
 * onSave(values) may return false to keep the dialog open.
 */
export function formDialog({ focus, title, fields, value = {}, onSave, onDelete, extraActions = [], saveLabel = 'Save', deleteMessage = 'Delete this entry? This cannot be undone.' }) {
  const inputs = {}, labels = {};
  const form = h('form', { class: 'form', novalidate: true });
  for (const f of fields) {
    let input;
    let v = value[f.key] ?? f.default ?? '';
    if (f.type === 'date' && v === '' && f.required) { const n = new Date(); v = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; }
    if (f.type === 'select') {
      input = h('select', { name: f.key });
      setOptions(input, f.options || [], v);
    } else if (f.type === 'textarea') {
      input = h('textarea', { name: f.key, rows: 3 }, v);
    } else if (f.type === 'checkbox') {
      input = h('input', { type: 'checkbox', name: f.key, checked: !!v });
    } else {
      input = h('input', { name: f.key, type: f.type === 'number' ? 'number' : f.type || 'text', step: f.step || (f.type === 'number' ? 'any' : null), inputmode: f.type === 'number' ? 'decimal' : null, value: v, autocomplete: 'off', list: f.list || null, readonly: f.readonly || null });
    }
    if (f.type === 'date' && v) input.value = v;
    inputs[f.key] = input;
    if (f.onInput) input.addEventListener('input', () => f.onInput(input, inputs));
    labels[f.key] = h('label', { class: 'field' + (f.type === 'checkbox' ? ' check' : '') + (f.half ? ' half' : '') },
      h('span', null, f.label), input, f.hint ? h('small', null, f.hint) : null);
    form.append(labels[f.key]);
  }
  const raw = () => Object.fromEntries(fields.map((f) => [f.key, f.type === 'checkbox' ? inputs[f.key].checked : inputs[f.key].value]));
  const visible = (f) => !f.showIf || f.showIf(raw());
  const refreshVisibility = () => { for (const f of fields) if (f.showIf) labels[f.key].style.display = visible(f) ? '' : 'none'; };
  form.addEventListener('input', refreshVisibility); form.addEventListener('change', refreshVisibility);
  refreshVisibility();
  const err = h('p', { class: 'form-error', role: 'alert' });
  form.append(err);
  const collect = () => {
    const out = {};
    for (const f of fields) {
      if (!visible(f)) continue;
      const el = inputs[f.key];
      let val = f.type === 'checkbox' ? el.checked : el.value;
      if (f.type === 'number') val = val === '' ? null : Number(val);
      if (f.type === 'text' || f.type === 'textarea') val = val.trim();
      if (f.required && (val === '' || val == null || Number.isNaN(val))) { err.textContent = `${f.label} is required.`; el.focus(); return null; }
      out[f.key] = val;
    }
    return out;
  };
  const submit = (close) => {
    const vals = collect();
    if (!vals) return;
    if (onSave(vals) !== false) close();
  };
  const actions = [{ label: 'Cancel', onclick: (c) => c() }];
  // The confirmation names what is about to go, so a wrong tap is easy to spot.
  const summary = () => {
    const rows = [];
    for (const f of fields) {
      if (f.type === 'checkbox' || !visible(f)) continue;
      const el = inputs[f.key]; let v = el.value;
      if (el.tagName === 'SELECT') v = el.selectedOptions[0] ? el.selectedOptions[0].textContent : '';
      if (v === '' || v == null) continue;
      rows.push(h('li', null, h('span', { class: 'muted' }, f.label.replace(/\s*\(.*\)\s*$/, '') + ': '), String(v).slice(0, 80)));
      if (rows.length >= 5) break;
    }
    return h('div', null, h('p', null, deleteMessage), rows.length ? h('ul', { class: 'del-sum' }, rows) : null, h('p', { class: 'note' }, 'A restore point is saved every day, so a mistake can be undone from Settings.'));
  };
  if (onDelete) actions.push({ label: 'Delete', class: 'danger', onclick: async (c) => { if (await confirmDialog(summary(), 'Yes, delete')) { if (onDelete() !== false) c(); } } });
  for (const a of extraActions) actions.push({ label: a.label, class: a.class || '', onclick: (c) => { c(); a.onclick(); } });
  actions.push({ label: saveLabel, class: 'primary', onclick: submit });
  const d = dialog(title, form, actions);
  form.addEventListener('submit', (e) => { e.preventDefault(); submit(d.close); });
  setTimeout(() => (focus && form.querySelector(`[name="${focus}"]`) || form.querySelector('input,select,textarea'))?.focus(), 30);
  return d;
}

/** A <datalist> of suggestions for a form field. Form fields take the id of one, not an array. Returns the id. */
export function datalistId(id, names) {
  let dl = document.getElementById(id);
  if (!dl) { dl = h('datalist', { id }); document.body.append(dl); }
  dl.replaceChildren(...[...new Set(names.filter(Boolean))].map((n) => h('option', { value: n })));
  return id;
}

// ---------- page building blocks ----------
export const section = (title, body, actions) => h('section', { class: 'card' },
  h('header', { class: 'card-head' }, h('h2', null, title), actions ? h('div', { class: 'card-actions' }, actions) : null), body);
export const stat = (label, value, sub, cls = '') => h('div', { class: 'stat ' + cls }, h('span', { class: 'stat-label' }, label), h('strong', { class: 'stat-value' }, value), sub ? h('span', { class: 'stat-sub' }, sub) : null);
const ICONS = {
  plus: 'M12 5v14M5 12h14', minus: 'M5 12h14', refresh: 'M23 4v6h-6M20.5 15a9 9 0 1 1-2.1-9.4L23 10', edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  swap: 'M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3', download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12', copy: 'M9 9h11v11H9zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3', check: 'M5 12l5 5L20 7',
};
export function icon(name) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'ico'); s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', ICONS[name] || ICONS.plus); s.append(p);
  return s;
}
/** Which icon suits a button label, if any. Buttons without a clear icon stay as words. */
const iconFor = (l) => (/^(Add|Record|Buy)\b/.test(l) ? 'plus' : /^Sell\b/.test(l) ? 'minus' : /^Transfer\b/.test(l) ? 'swap' : /^(Edit|Change)\b/.test(l) ? 'edit'
  : /^Download\b/.test(l) ? 'download' : /^Upload\b/.test(l) ? 'upload' : /^(Refresh|Sync)\b/.test(l) ? 'refresh' : /^Fetch\b/.test(l) ? 'download' : /^Copy\b/.test(l) ? 'copy' : null);
/** Button. In page headers on a phone, buttons with an icon show only the icon (keep: true keeps the words). */
export const btn = (label, onclick, cls = '', { keep = false } = {}) => {
  const ic = keep ? null : iconFor(label);
  if (!ic) return h('button', { class: cls, onclick, type: 'button' }, label);
  return h('button', { class: (cls + ' ib').trim(), onclick, type: 'button', 'aria-label': label, title: label }, h('span', { class: 'ic' }, icon(ic)), h('span', { class: 'lb' }, label));
};
export const empty = (msg) => h('p', { class: 'empty' }, msg);

/** Table. cols: [{label, get(row), cls, render(row)->node|string, total}] */
/**
 * A table that stays readable on a phone.
 * Column options for small screens (under 700px):
 *   mob: 'under'  the value moves to a small grey line under the main (first or `host`) column
 *   mob: 'hide'   (phones now show every column on a card, so this no longer hides anything)
 *   mlabel        short text put before an 'under' value, such as 'rate '
 *   mu(row)       what to show in the small line when it should differ from the cell
 *   host: true    the column that carries the small line (default: the first)
 */
export function table(cols, rows, { onRow, footer, rowClass, empty: emptyMsg = 'Nothing here yet.', mobile: mobileIn = null, m: mfrom = null } = {}) {
  const mobile = mfrom ? mobileFrom(cols, mfrom) : mobileIn; // `m` builds the phone rows from these very columns (see mobileFrom)
  if (!rows.length) return empty(emptyMsg);
  const small = (c) => (c.mob === 'under' || c.mob === 'hide' ? ' hide-sm' : '') + (c.show === 'desk' ? ' desk-only' : '');
  let hostI = cols.findIndex((c) => c.host); if (hostI < 0) hostI = 0;
  const unders = cols.filter((c) => c.mob === 'under');
  const fit = cols.some((c) => c.mob);
  const cell = (c, r) => (c.render ? c.render(r) : c.get(r));
  const underLine = (r) => {
    const parts = unders.map((c) => { const v = c.mu ? c.mu(r) : cell(c, r); return v == null || v === '' || v === '–' ? null : [c.mlabel || '', v]; }).filter(Boolean);
    return parts.length ? h('div', { class: 'm-under sub2' }, parts.map((p, i) => [i ? ' · ' : '', p[0], p[1]])) : null;
  };
  const t = h('table', { class: 'tbl' + (fit ? ' fit' : '') },
    h('thead', null, h('tr', null, cols.map((c, i) => h('th', { class: (c.cls || '') + small(c) + (i === hostI ? ' host' : '') }, c.label)))),
    h('tbody', null, rows.map((r) => h('tr', { class: (onRow ? 'click ' : '') + (rowClass ? rowClass(r) || '' : ''), tabindex: onRow ? 0 : null, onclick: onRow ? () => onRow(r) : null, onkeydown: onRow ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onRow(r)) : null },
      cols.map((c, i) => h('td', { class: (c.cls || '') + (c.key ? ' key' : '') + small(c) + (i === hostI ? ' host' : ''), 'data-label': c.label }, cell(c, r), i === hostI ? underLine(r) : null))))),
    footer ? h('tfoot', { class: footer.phone === false ? 'no-m' : '' }, h('tr', null, cols.map((c, i) => h('td', { class: (c.cls || '') + (c.key ? ' key' : '') + small(c) + (i === hostI ? ' host' : '') + (i !== hostI && !c.total ? ' blank' : ''), 'data-label': c.label }, i === hostI ? footer.label || 'Total' : c.total ? c.total(rows) : '')))) : null);
  const wrap = h('div', { class: 'tbl-wrap' + (mobile ? ' has-m' : '') }, t);
  if (mobile) wrap.append(mobileRows(rows, mobile, { onRow, rowClass })); // phones only: css hides it from 701px up and hides the table below that
  return wrap; // on a phone each row becomes a card that shows every field (see app.css)
}

// ----- phone rows: fixed first column, optional middle, final column that cycles through groups of figures -----
const viewMem = new Map(), viewState = new Map();
const readView = (key) => { if (viewMem.has(key)) return viewMem.get(key); let i = 0; try { i = Number(localStorage.getItem('pt.mv.' + key)) || 0; } catch { /* private window */ } viewMem.set(key, i); return i; };
const saveView = (key, i) => { viewMem.set(key, i); try { localStorage.setItem('pt.mv.' + key, String(i)); } catch { /* ignore */ } };
const dash = (v) => (v == null || v === '' ? '–' : v);
/**
 * Compact phone rows for a table. Desktop keeps the normal table (this block is hidden there by css).
 * m = {
 *   key: 'shares',                       remembers the chosen view on this device
 *   head: 'Holding',                     heading over the first column
 *   first: (r) => ({ title, sub, tag }), fixed, two lines; never changes when the view changes
 *   mid: (r) => node | null,             optional fixed contextual info (a trend only when real history exists); omitted when no row has any
 *   views: [{ label, main: (r) => node, sub: (r) => node, total?: (rows) => ({ main, sub }) }],  tap the heading to go to the next view, after the last comes the first
 * }
 * Rows keep their order (sorting is separate), their click action and their row class.
 */
export function mobileRows(rows, m, { onRow, rowClass } = {}) {
  const n = m.views.length;
  let idx = readView(m.key) % n;
  const root = h('div', { class: 'mrows', 'aria-label': m.head || 'List' });
  // optional phone-only sort and filter that work on these rows alone (screens that already sort or filter keep doing that themselves and leave these out)
  const sOpts = m.sort ? m.sort.options : null;
  const fFields = m.filters || null;
  const st = (viewState.get(m.key) || (viewState.set(m.key, { sort: m.sort ? { ...m.sort.default } : null, f: Object.fromEntries((fFields || []).map((f) => [f.key, f.default ?? 'all'])) }), viewState.get(m.key)));
  const draw = () => {
    let shown = rows;
    if (fFields) for (const f of fFields) { const ok = (typeof f.options === 'function' ? f.options(rows) : f.options).map((o) => String(typeof o === 'object' ? o.value : o)); if (st.f[f.key] !== (f.default ?? 'all') && !ok.includes(String(st.f[f.key]))) st.f[f.key] = f.default ?? 'all'; }
    if (fFields) shown = shown.filter((r) => fFields.every((f) => st.f[f.key] === (f.default ?? 'all') || String(f.get(r)) === String(st.f[f.key])));
    const cur = st.sort && sOpts && sOpts.find((o) => o.value === st.sort.value);
    if (cur && cur.get) {
      const sign = st.sort.dir === 'asc' ? 1 : -1, empty = (v) => v == null || v === '' || (typeof v === 'number' && isNaN(v));
      shown = shown.map((r, i) => ({ r, i, v: cur.get(r) })).sort((a, b) => (empty(a.v) - empty(b.v)) || (empty(a.v) ? 0 : sign * (typeof a.v === 'string' ? a.v.localeCompare(b.v) : a.v - b.v)) || a.i - b.i).map((o) => o.r);
    }
    const mids = m.mid ? shown.map((r) => m.mid(r)) : [];
    const hasMid = mids.some((x) => x != null && x !== '');
    const ends = [];
    const endNodes = (r) => { const v = m.views[idx]; const sub = v.sub ? v.sub(r) : null; return [h('div', { class: 'mr-main' }, dash(v.main(r))), sub != null && sub !== '' ? h('div', { class: 'mr-sub' }, sub) : null].filter(Boolean); };
    const foot = m.views[0].total ? h('div', { class: 'mrow mr-total' + (hasMid ? ' has-mid' : '') }, h('div', { class: 'mr-first' }, h('div', { class: 'mr-title' }, m.footLabel || 'Total')), hasMid ? h('div', { class: 'mr-mid' }) : null, h('div', { class: 'mr-end' })) : null;
    const drawFoot = () => { if (!foot) return; const t = m.views[idx].total ? m.views[idx].total(shown) : null; foot.querySelector('.mr-end').replaceChildren(...[h('div', { class: 'mr-main' }, dash(t && t.main)), t && t.sub ? h('div', { class: 'mr-sub' }, t.sub) : null].filter(Boolean)); };
    const label = h('span', { class: 'mr-vlabel' }, m.views[idx].label);
    const cycle = () => { idx = (idx + 1) % n; saveView(m.key, idx); label.textContent = m.views[idx].label; ends.forEach(([el, r]) => el.replaceChildren(...endNodes(r))); drawFoot(); };
    const head = h('div', { class: 'mrow mr-head' + (hasMid ? ' has-mid' : '') }, h('div', { class: 'mr-first' }, m.head || ''), hasMid ? h('div', { class: 'mr-mid' }, m.midHead || '') : null,
      n > 1 ? h('button', { type: 'button', class: 'mr-end mr-cycle', 'aria-label': 'Tap to change the figures shown', onclick: (e) => { e.stopPropagation(); cycle(); } }, label, h('span', { class: 'mr-ic', 'aria-hidden': 'true' }, '⇄')) : h('div', { class: 'mr-end' }, label));
    const body = shown.map((r, i) => {
      const f = m.first(r) || {};
      // tapping the last column of any row switches the figures for every row (same as the heading); the rest of the row still opens it. A button or link inside the cell keeps its own action.
      const end = h('div', { class: 'mr-end' + (n > 1 ? ' mr-tap' : ''), onclick: n > 1 ? (e) => { if (e.target.closest && e.target.closest('button, a, input, select, label')) return; e.stopPropagation(); cycle(); } : null }, ...endNodes(r));
      ends.push([end, r]);
      const go = onRow ? () => onRow(r) : null;
      return h('div', { class: 'mrow' + (hasMid ? ' has-mid' : '') + (go ? ' click' : '') + (rowClass ? ' ' + (rowClass(r) || '') : ''), tabindex: go ? 0 : null, role: go ? 'button' : null, onclick: go, onkeydown: go ? (e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); go(); } } : null },
        h('div', { class: 'mr-first' }, h('div', { class: 'mr-title' }, f.title, f.tag ? h('small', { class: 'tag' }, f.tag) : null), f.sub != null && f.sub !== '' ? h('div', { class: 'mr-subline' }, f.sub) : null, f.extra || null),
        hasMid ? h('div', { class: 'mr-mid' }, mids[i] || null) : null, end);
    });
    drawFoot();
    let bar = null;
    if (sOpts || fFields) {
      const filters = fFields ? { values: st.f, fields: fFields.map((f) => ({ key: f.key, label: f.label, type: 'select', default: f.default ?? 'all', options: [{ value: f.default ?? 'all', label: f.allLabel || 'All' }, ...(typeof f.options === 'function' ? f.options(rows) : f.options).map((o) => (typeof o === 'object' ? o : { value: o, label: o }))] })), apply: (v) => { st.f = v; draw(); } } : null;
      const sort = sOpts ? { options: sOpts.map(({ value, label, kind }) => ({ value, label, kind })), value: st.sort.value, dir: st.sort.dir, apply: (value, dir) => { st.sort = { value, dir }; draw(); } } : null;
      bar = sortFilterBar({ sort, filters });
    }
    const none = !shown.length && rows.length ? h('p', { class: 'empty' }, 'Nothing matches these filters.') : null;
    root.replaceChildren(...[bar, head, ...body, none, foot].filter(Boolean));
  };
  draw();
  return root;
}

/**
 * Build a phone-row config from a table's own columns, so the phone rows show the very same cells and totals.
 *   o = { key, head, title?: (r) => node, sub?: ['Column label', …] | (r) => node, mid?: 'Column label', midHead?, extra?: 'Column label' (shown under the first column, e.g. a button),
 *         views: [['Column A', 'Column B'], ['Column C']],   // label is "A · B"; B is the small line under A
 *         sort?: [{ value, label, kind, get }], sortDefault?: { value, dir }, filters? }
 * A column is found by its label. Totals come from the columns' own `total` (a table with a footer shows them for the chosen view).
 */
export function mobileFrom(cols, o) {
  const by = (l) => cols.find((c) => c.label === l);
  const cell = (c, r) => (c.render ? c.render(r) : c.get(r));
  const host = cols.find((c) => c.host) || cols[0];
  const subs = Array.isArray(o.sub) ? o.sub.map(by).filter(Boolean) : null;
  const hasTotal = o.views.some((v) => v.some((l) => by(l) && by(l).total));
  const views = o.views.map((v) => {
    const a = by(v[0]), b = v[1] ? by(v[1]) : null;
    if (!a) throw new Error('mobileFrom: no column ' + v[0]);
    return { label: v.join(' · '), main: (r) => cell(a, r), sub: b ? (r) => cell(b, r) : null, total: hasTotal ? (rs) => ({ main: a.total ? a.total(rs) : null, sub: b && b.total ? b.total(rs) : null }) : undefined };
  });
  const midCol = o.mid != null ? by(o.mid) : null;
  const extraCol = o.extra != null ? by(o.extra) : null;   // a column shown under the first line, such as a button
  const dashy = (v) => v == null || v === '' || v === '–';
  return {
    key: o.key, head: o.head || host.label, midHead: o.midHead ?? o.mid, views,
    first: (r) => ({ extra: extraCol ? cell(extraCol, r) : null, title: o.title ? o.title(r) : cell(host, r), sub: typeof o.sub === 'function' ? o.sub(r) : subs ? subs.map((c) => cell(c, r)).filter((v) => !dashy(v)).map((v, i) => [i ? ' · ' : '', v]) : null }),
    mid: midCol ? (r) => { const v = cell(midCol, r); return dashy(v) ? null : v; } : undefined,
    sort: o.sort ? { options: o.sort, default: o.sortDefault || { value: o.sort[0].value, dir: 'asc' } } : undefined, filters: o.filters,
  };
}

/**
 * Months split by year so the list starts with this year: this year's months, the last few months of last year, then everything earlier.
 * Returns [{ label, months }] (newest first). A single group has label ''.
 */
export function monthGroups(months, selected) {
  const y = Number(String((S.all && S.all.asOf) || new Date().toISOString()).slice(0, 4));
  const nowKey = String((S.all && S.all.asOf) || new Date().toISOString()).slice(0, 7);
  const list = [...new Set([...months, nowKey])].sort().reverse();
  const cur = list.filter((m) => m.startsWith(String(y))), prev = list.filter((m) => m.startsWith(String(y - 1)) && m.slice(5) >= '09');
  const rest = list.filter((m) => !cur.includes(m) && !prev.includes(m));
  // keep whatever is chosen visible even if it is older
  const g = [{ label: String(y), months: cur }, { label: 'Late ' + (y - 1), months: prev }, { label: 'Earlier', months: rest }].filter((x) => x.months.length);
  return g.length > 1 ? g : g.map((x) => ({ label: '', months: x.months }));
}
/** <option> / <optgroup> nodes for a month select. */
export function monthOptions(months, selected, fmt = (m) => monthLabel(m, true)) {
  const opt = (m) => h('option', { value: m, selected: m === selected }, fmt(m));
  return monthGroups(months, selected).map((g) => (g.label ? h('optgroup', { label: g.label }, g.months.map(opt)) : g.months.map(opt))).flat();
}
export function monthPicker(months, value, onChange) {
  return h('select', { class: 'month-select', 'aria-label': 'Month', onchange: (e) => onChange(e.target.value) }, monthOptions(months, value));
}

/**
 * Plain list rows instead of a table: easier to read on a phone.
 * items: [{ lead?: node, title, sub?, value, valueSub?, tone?: 'pos'|'neg'|'warn', onClick?, extra?: node }]
 */
export function rowList(items, { empty: emptyMsg = 'Nothing here yet.' } = {}) {
  if (!items.length) return empty(emptyMsg);
  return h('ul', { class: 'rl' }, items.map((it) => h('li', { class: it.onClick ? 'click' : '', tabindex: it.onClick ? 0 : null, onclick: it.onClick || null, onkeydown: it.onClick ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), it.onClick()) : null },
    it.lead ? h('span', { class: 'rl-lead' }, it.lead) : null,
    h('span', { class: 'rl-main' }, h('span', { class: 'rl-title' }, it.title), it.sub ? h('span', { class: 'rl-sub' }, it.sub) : null, it.extra || null),
    h('span', { class: 'rl-end' }, h('span', { class: 'rl-val ' + (it.tone || '') }, it.value), it.valueSub ? h('span', { class: 'rl-sub' }, it.valueSub) : null))));
}
/** Dashboard tile: small label, big number, one line of context. */
export function kpi(label, value, sub, { tone = '', href = null, spark: sp = null } = {}) {
  const el = h(href ? 'a' : 'div', { class: 'kpi' + (href ? ' link' : ''), href },
    h('span', { class: 'kpi-label' }, label), h('strong', { class: 'kpi-value ' + tone }, value), sub ? h('span', { class: 'kpi-sub' }, sub) : null, sp ? h('span', { class: 'kpi-spark' }, sp) : null);
  return el;
}
/** Calendar-style date badge: 13 / NOV */
export const dateChip = (iso) => h('span', { class: 'datechip' }, h('b', null, String(Number(iso.slice(8, 10)))), h('small', null, MON[Number(iso.slice(5, 7)) - 1].toUpperCase()));

// ----- popover: a small card opened by a click, closed by clicking anywhere else or pressing Escape -----
let openPop = null;
const closePop = () => { if (openPop) { openPop.el.remove(); openPop.trigger.setAttribute('aria-expanded', 'false'); openPop = null; } };
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => { if (openPop && !openPop.el.contains(e.target) && !openPop.trigger.contains(e.target)) closePop(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePop(); });
  window.addEventListener('rerender', closePop); window.addEventListener('hashchange', closePop);
}
/**
 * Make `trigger` open its working in a bottom sheet on a phone and a popup on a desktop (the same dialog as the rest of the app).
 * build() returns { title, rows, foot, note }. A row is { l: label, v: value, n: short working, b: bold, tone: 'inc'|'exp'|'inv' (colour of the value), memo: shown in grey and not counted,
 * warn: text of a ⚠ shown beside the label (a figure worked out now rather than recorded) } or { head } or a group { group: label, v: total, tone, open, rows: [...] } whose header folds the rows under it.
 */
export function tapSheet(trigger, build) {
  trigger.setAttribute('tabindex', '0'); trigger.setAttribute('role', 'button'); trigger.classList.add('pop-trigger');
  const rowEl = (r) => {
    if (r.head) return h('h4', { class: 'ts-head' }, r.head);
    if (r.group) {
      const d = h('details', { class: 'ts-group' + (r.tone ? ' ' + r.tone : ''), open: r.open === false ? null : '' },
        h('summary', null, h('span', { class: 'ts-l' }, r.group), h('span', { class: 'ts-v ' + (r.tone || '') }, r.v ?? '')),
        ...(r.rows || []).map(rowEl));
      return d;
    }
    return h('div', { class: 'ts-row' + (r.b ? ' b' : '') + (r.memo ? ' memo' : '') + (r.sub ? ' sub' : '') },
      h('span', { class: 'ts-l' }, r.l, r.warn ? h('span', { class: 'calc-alert', title: r.warn, 'aria-label': r.warn, role: 'img' }, '⚠') : null),
      h('span', { class: 'ts-v ' + (r.tone || '') }, r.v), r.n ? h('span', { class: 'ts-n' }, r.n) : null);
  };
  const open = (e) => {
    e.preventDefault(); e.stopPropagation();
    const c = build();
    dialog(c.title || 'Working', h('div', { class: 'tapsheet' },
      c.note ? h('p', { class: 'note', style: { marginTop: 0 } }, c.note) : null,
      ...(c.rows || []).map(rowEl),
      c.foot ? h('p', { class: 'note' }, c.foot) : null), [{ label: 'Done', class: 'primary', onclick: (cl) => cl() }]);
  };
  trigger.addEventListener('click', open);
  trigger.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') open(e); });
  return trigger;
}
/**
 * Make `trigger` open a popover. build() returns { title, rows: [{ l: label, v: value, n: short working }], foot }.
 * Tapping the trigger again, tapping outside or pressing Escape closes it.
 */
export function popover(trigger, build) {
  trigger.setAttribute('tabindex', '0'); trigger.setAttribute('role', 'button'); trigger.setAttribute('aria-expanded', 'false');
  trigger.classList.add('pop-trigger');
  const open = (e) => {
    e.preventDefault(); e.stopPropagation();
    if (openPop && openPop.trigger === trigger) return closePop();
    closePop();
    const c = build();
    const el = h('div', { class: 'popover', role: 'dialog' },
      c.title ? h('div', { class: 'pop-title' }, c.title) : null,
      ...(c.rows || []).map((r) => h('div', { class: 'pop-row' + (r.b ? ' b' : '') }, h('span', { class: 'pop-l' }, r.l), h('span', { class: 'pop-v' }, r.v), r.n ? h('span', { class: 'pop-n' }, r.n) : null)),
      c.foot ? h('div', { class: 'pop-foot' }, c.foot) : null);
    document.body.append(el);
    const b = trigger.getBoundingClientRect(), w = el.offsetWidth, hh = el.offsetHeight;
    el.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, b.right - w)) + 'px';
    el.style.top = (b.bottom + hh + 12 > window.innerHeight && b.top > hh + 12 ? b.top - hh - 6 : b.bottom + 6) + 'px';
    trigger.setAttribute('aria-expanded', 'true'); openPop = { el, trigger };
  };
  trigger.addEventListener('click', open);
  trigger.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') open(e); });
  return trigger;
}
