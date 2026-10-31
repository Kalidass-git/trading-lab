// Phone sort and filter: a small bar above a list (Sort, Filter) that opens a bottom sheet with Apply.
// The bar only shows on phones (css). Each screen hands in its own options and the functions that change ITS existing state,
// so there is still one source of truth and the desktop controls keep working as before.
import { h } from './ui.js';

const DIRS = {
  num: [['desc', 'High to low', '↓'], ['asc', 'Low to high', '↑']],
  text: [['asc', 'A to Z', '↓'], ['desc', 'Z to A', '↑']],
  date: [['desc', 'Newest first', '↓'], ['asc', 'Oldest first', '↑']],
  due: [['asc', 'Earliest first', '↓'], ['desc', 'Latest first', '↑']],
};
/** The direction a field starts with when you pick it: biggest, newest or A first; due dates soonest first. */
export const firstDir = (kind) => DIRS[kind || 'num'][0][0];
export const dirLabel = (kind, dir) => { const d = (DIRS[kind || 'num'] || DIRS.num).find((x) => x[0] === dir); return d ? d[1] : ''; };

let lastFocus = null;
/** A bottom sheet: handle, title, scrolling body, Apply (and Reset). Closes on the backdrop, the ✕, Escape or a swipe down. Nothing is applied unless Apply is pressed. */
function sheet({ title, body, onApply, onReset, applyLabel = 'Apply' }) {
  lastFocus = document.activeElement;
  const dlg = h('dialog', { class: 'msheet', 'aria-label': title });
  const done = () => { document.documentElement.classList.remove('msheet-open'); dlg.remove(); if (lastFocus && lastFocus.focus) try { lastFocus.focus(); } catch { /* gone */ } };
  const close = () => { if (dlg.open) dlg.close(); else done(); };
  dlg.addEventListener('close', done);
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
  let y0 = null;
  const grip = h('div', { class: 'ms-grip', ontouchstart: (e) => { y0 = e.touches[0].clientY; }, ontouchend: (e) => { if (y0 != null && e.changedTouches[0].clientY - y0 > 60) close(); y0 = null; }, onclick: close },
    h('span', { class: 'ms-handle', 'aria-hidden': 'true' }));
  dlg.append(grip,
    h('div', { class: 'ms-head' }, h('h2', null, title), h('button', { type: 'button', class: 'ms-x', 'aria-label': 'Close', onclick: close }, '✕')),
    h('div', { class: 'ms-body' }, body),
    h('div', { class: 'ms-foot' }, onReset ? h('button', { type: 'button', class: 'ms-reset', onclick: () => onReset(close) }, 'Reset') : null, h('button', { type: 'button', class: 'primary', onclick: () => { onApply(); close(); } }, applyLabel)));
  document.documentElement.classList.add('msheet-open');
  document.body.append(dlg);
  dlg.showModal();
  const on = dlg.querySelector('input:checked') || dlg.querySelector('select, input');
  if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
  return dlg;
}

/** A read-only bottom sheet for a card of information (Done closes it). A link inside it closes the sheet as the page changes. */
export function openInfo(title, body) {
  const dlg = sheet({ title, body, applyLabel: 'Done', onApply: () => {} });
  dlg.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('a[href]')) dlg.close(); });
  return dlg;
}

/**
 * Sort sheet. sort = { options: [{ value, label, kind: 'num'|'text'|'date'|'due'|'none' }], value, dir, apply(value, dir) }
 * A radio per field; the chosen field shows its two direction buttons, named for the kind of data.
 */
export function openSort(sort) {
  let value = sort.value, dir = sort.dir;
  const body = h('div', { class: 'ms-list', role: 'radiogroup', 'aria-label': 'Sort by' });
  const draw = () => {
    body.replaceChildren(...sort.options.map((o) => {
      const on = o.value === value, dirs = on && o.kind !== 'none' ? DIRS[o.kind || 'num'] : null;
      return h('div', { class: 'ms-opt' + (on ? ' on' : '') },
        h('label', { class: 'ms-row' }, h('input', { type: 'radio', name: 'msort', value: o.value, checked: on, onchange: () => { value = o.value; dir = o.kind === 'none' ? 'asc' : (o.value === sort.value ? sort.dir : firstDir(o.kind)); draw(); } }), h('span', { class: 'ms-rl' }, o.label)),
        dirs ? h('div', { class: 'ms-dirs' }, dirs.map(([d, l, ic]) => h('button', { type: 'button', class: 'ms-dir', 'aria-pressed': String(dir === d), onclick: () => { dir = d; draw(); } }, h('span', { 'aria-hidden': 'true' }, ic + ' '), l))) : null);
    }));
  };
  draw();
  sheet({ title: 'Sort by', body, onApply: () => sort.apply(value, dir) });
}

/** A filter value equals the default; a multi-choice value is a list, compared without caring about order. */
const sameVal = (a, b) => (Array.isArray(a) && Array.isArray(b) ? a.length === b.length && a.every((x) => b.includes(x)) : a === b);
/** Chips you can switch on and off together. `onChange(list)` gets the new list; the last chip left on cannot be switched off. */
export function chipGroup(options, selected, onChange, { label = 'Show' } = {}) {
  const on = new Set(selected);
  return h('div', { class: 'chipset', role: 'group', 'aria-label': label }, options.map((o) => h('button', { type: 'button', class: 'chipopt' + (on.has(o.value) ? ' on' : ''), 'aria-pressed': String(on.has(o.value)),
    onclick: () => { const next = new Set(on); if (next.has(o.value)) { if (next.size > 1) next.delete(o.value); } else next.add(o.value); onChange(options.map((x) => x.value).filter((v) => next.has(v))); } },
    on.has(o.value) ? h('span', { class: 'chk', 'aria-hidden': 'true' }, '✓ ') : null, o.label)));
}

const optNodes = (opts, cur) => opts.map((o) => (o.group ? h('optgroup', { label: o.group }, optNodes(o.options, cur)) : h('option', { value: o.value, selected: String(o.value) === String(cur) }, o.label)));
const optLabel = (opts, v) => { for (const o of opts) { if (o.group) { const x = optLabel(o.options, v); if (x != null) return x; } else if (String(o.value) === String(v)) return o.label; } return null; };

/**
 * Filter sheet. filters = { fields: [{ key, label, type: 'select'|'number', options?, default, showIf?(values), count?: false, chip?(values) }], values, apply(values) }
 * Edits stay in the sheet until Apply. Reset puts every field back to its default (it does not touch sorting).
 */
export function openFilter(filters) {
  const vals = { ...filters.values };
  const body = h('div', { class: 'ms-fields' });
  const draw = () => {
    body.replaceChildren(...filters.fields.filter((f) => !f.showIf || f.showIf(vals)).map((f) => {
      const id = 'mf-' + f.key;
      if (f.type === 'chips') return h('div', { class: 'ms-field' }, h('label', null, f.label), chipGroup(f.options, vals[f.key], (list) => { vals[f.key] = list; draw(); }, { label: f.label }));
      const input = f.type === 'number'
        ? h('input', { id, type: 'number', min: '0', step: 'any', inputmode: 'decimal', placeholder: f.placeholder || '', value: vals[f.key] ?? '', oninput: (e) => { vals[f.key] = e.target.value; } })
        : h('select', { id, onchange: (e) => { vals[f.key] = e.target.value; draw(); } }, optNodes(f.options, vals[f.key]));
      return h('div', { class: 'ms-field' }, h('label', { for: id }, f.label), input);
    }));
  };
  draw();
  sheet({ title: 'Filter', body, applyLabel: 'Apply', onApply: () => filters.apply({ ...vals }),
    onReset: () => { for (const f of filters.fields) vals[f.key] = Array.isArray(f.default) ? [...f.default] : f.default; draw(); } });
}

/** Chips for what is switched on right now, each with a ✕ to remove just that one. */
function activeChips(filters) {
  const out = [];
  for (const f of filters.fields) {
    const v = filters.values[f.key];
    if (sameVal(v, f.default) || f.count === false && !f.chip) continue;
    const text = f.chip ? f.chip(filters.values) : f.type === 'select' ? `${f.label}: ${optLabel(f.options, v) ?? v}` : null;
    if (!text) continue;
    out.push({ text, clear: () => { const nv = { ...filters.values }; nv[f.key] = f.default; for (const g of filters.fields) if (g.showIf && !g.showIf(nv)) nv[g.key] = g.default; filters.apply(nv); } });
  }
  return out;
}
export const activeCount = (filters) => filters.fields.filter((f) => f.count !== false && !sameVal(filters.values[f.key], f.default)).length;

/**
 * The bar itself. Either part is optional.
 *   sort    as for openSort (with the current value and dir)
 *   filters as for openFilter (with the current values)
 *   search  an extra node (a search box) shown under the buttons
 */
export function sortFilterBar({ sort, filters, search, filterFirst = false }) {
  const cur = sort && sort.options.find((o) => o.value === sort.value);
  const n = filters ? activeCount(filters) : 0;
  const chips = filters ? activeChips(filters) : [];
  const sortBtn = sort ? h('button', { type: 'button', class: 'sf-btn sf-sort', 'aria-haspopup': 'dialog', 'aria-label': 'Sort: ' + (cur ? cur.label + (cur.kind === 'none' ? '' : ', ' + dirLabel(cur.kind, sort.dir)) : 'none') + '. Tap to change.', onclick: () => openSort(sort) },
        h('span', { class: 'sf-ic', 'aria-hidden': 'true' }, '⇅'), h('span', { class: 'sf-tx' }, h('small', null, 'Sort'), cur ? cur.label + (cur.kind === 'none' ? '' : ' · ' + dirLabel(cur.kind, sort.dir)) : '–')) : null;
  const filterBtn = filters ? h('button', { type: 'button', class: 'sf-btn sf-filter' + (n ? ' on' : ''), 'aria-haspopup': 'dialog', 'aria-label': 'Filter' + (n ? `, ${n} active` : ''), onclick: () => openFilter(filters) },
        h('span', { class: 'sf-ic', 'aria-hidden': 'true' }, '⚲'), h('span', { class: 'sf-tx' }, h('small', null, 'Filter'), n ? `${n} active` : 'All')) : null;
  return h('div', { class: 'sfbar' },
    h('div', { class: 'sf-row' }, ...(filterFirst ? [filterBtn, sortBtn] : [sortBtn, filterBtn]).filter(Boolean)),
    chips.length ? h('div', { class: 'sf-chips' }, chips.map((c) => h('button', { type: 'button', class: 'sf-chip', 'aria-label': 'Remove filter ' + c.text, onclick: c.clear }, c.text, h('span', { 'aria-hidden': 'true' }, ' ✕')))) : null,
    search || null);
}
