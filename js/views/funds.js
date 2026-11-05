// Trading Lab: Funds and Indexes. The Funds tab follows mutual funds and shows how each has done against its index; the Indexes tab is a scoreboard of
// NIFTY 50, midcap, smallcap, sectors and any index you add. Search, NAV and index history are fetched only when a button is pressed.
import * as FD from '../lab/funds.js';
import * as HS from '../lab/history.js';
import * as SR from '../lab/series.js';
import { S } from '../store.js';
import { h, dec, dateStr, section, table, formDialog, segTabs, subTab, toast, canEdit, empty } from '../ui.js';
import { LAB, rerender, quote, rs2, run, ago, chg } from './lab-shared.js';
import { loadIndexBtn, shortName } from './instrument.js';

const st = { q: '', hits: null, busy: '', code: '' };
const openFund = (code) => { location.hash = '#/fund/' + encodeURIComponent(code); };
const openIndex = (sym) => { location.hash = '#/index/' + encodeURIComponent(sym); };
const ret = (hist, label) => { if (!hist) return null; const r = SR.periodReturns(hist.d, hist.c).find((x) => x.label === label); return r ? r.value : null; };

async function search(input) {
  const q = input.value.trim(); if (q.length < 3) return toast('Type at least 3 letters of the fund name.', 'bad');
  if (!S.remote) return toast('Fund search needs the Google Drive backend. Connect it in Settings.', 'bad');
  st.q = q; st.busy = 'search'; st.hits = null; rerender();
  try { st.hits = await FD.search(q); if (!st.hits.length) toast('No fund matched “' + q + '”. Try fewer words, for example “parag parikh flexi”.', 'bad'); } catch (e) { toast(e.message, 'bad'); }
  st.busy = ''; rerender();
}
/** Follow a fund and bring its NAV history now (the person just chose it, so this is the press that loads it). */
async function pick(code, name) {
  if (st.busy) return; st.busy = 'load'; rerender();
  try {
    const rec = await FD.load(code);
    if (canEdit()) run((l) => { l.funds = l.funds || []; if (!l.funds.some((f) => f.code === code)) l.funds.push({ id: 'fu' + code, code, name: rec.name || name, bench: FD.suggestBenchmark(rec.name || name, rec.category) }); });
    st.hits = null; st.busy = ''; openFund(code); return;
  } catch (e) { toast(e.message, 'bad'); }
  st.busy = ''; rerender();
}
async function loadAll(kind, lab) {
  if (st.busy) return; if (!S.remote) return toast('This needs the Google Drive backend. Connect it in Settings.', 'bad');
  st.busy = kind; rerender(); let ok = 0, bad = [];
  const jobs = kind === 'funds' ? FD.followed(lab).map((f) => ({ name: f.name, run: () => FD.load(f.code) })) : FD.indexList(lab).map((x) => ({ name: x.name, run: () => FD.loadIndex(x, HS.dataOf(x.sym) ? null : '10y') }));
  for (const j of jobs) { try { await j.run(); ok++; } catch (e) { bad.push(`${shortName(j.name)}: ${e.message}`); } }
  st.busy = ''; toast(bad.length ? `Loaded ${ok} of ${jobs.length}. ${bad[0]}` : `Loaded ${ok} ${ok === 1 ? 'item' : 'items'}`, bad.length ? 'bad' : ''); rerender();
}

function fundsTab(lab) {
  const out = [], list = FD.followed(lab);
  const input = h('input', { type: 'search', placeholder: 'Fund name, for example parag parikh flexi', 'aria-label': 'Search mutual funds', value: st.q, autocomplete: 'off', onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); search(e.currentTarget); } } });
  const code = h('input', { type: 'text', inputmode: 'numeric', placeholder: 'or a scheme code', 'aria-label': 'Scheme code', style: { maxWidth: '10rem' }, onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); const c = e.currentTarget.value.replace(/\D/g, ''); if (c) pick(c, 'Fund ' + c); } } });
  out.push(section('Find a fund', h('div', null,
    h('div', { class: 'fx-find' }, input, h('button', { type: 'button', class: 'primary', disabled: !!st.busy, onclick: () => search(input) }, st.busy === 'search' ? 'Searching…' : 'Search'), code),
    st.busy === 'load' ? h('p', { class: 'note' }, 'Loading the NAV history…') : null,
    st.hits && st.hits.length ? h('div', { class: 'fx-hits' }, st.hits.map((f) => h('button', { type: 'button', class: 'fx-hit', onclick: () => pick(f.code, f.name) }, f.name, h('small', null, `${FD.planOf(f.name) || ''} ${FD.optionOf(f.name) || ''} · code ${f.code}`.trim())))) : null,
    h('p', { class: 'note' }, 'Search a fund, tap it, and its full NAV history is loaded and kept on this device. Use the Direct plan with the Growth option to compare like with like. Nothing is fetched until you press Search or choose a fund.'))));
  if (!list.length) { out.push(section('Your funds', empty('No funds yet. Search above and tap a fund to follow it.'))); return out; }
  const rows = list.map((f) => {
    const rec = FD.dataOf(f.code), bench = FD.indexBySym(lab, f.bench || FD.suggestBenchmark(f.name)), bh = bench && FD.seriesOfIndex(bench.sym), s = rec ? { d: rec.d, c: rec.c } : null;
    const cmp = s && bh ? SR.compareRolling(s, bh, Math.min(36, SR.dayNo(s.d[s.d.length - 1]) - SR.dayNo(s.d[0]) > 36 * 31 + 30 ? 36 : 12)) : null;
    return { f, rec, bench, r1: ret(s, '1Y'), r3: ret(s, '3Y'), r5: ret(s, '5Y'), ahead: cmp && cmp.n ? cmp.ahead : null, months: cmp ? cmp.months : null };
  });
  out.push(section('Your funds', h('div', null,
    table([
      { label: 'Fund', host: true, get: (r) => shortName(r.f.name), mob: 'under', mu: (r) => [FD.planOf(r.f.name), r.bench ? 'vs ' + r.bench.name : ''].filter(Boolean).join(' · ') },
      { label: 'NAV', cls: 'r', mob: 'hide', get: (r) => (r.rec ? rs2(r.rec.c[r.rec.c.length - 1]) : '–') },
      { label: '1Y', cls: 'r', render: (r) => (r.rec ? chg(r.r1, 1) : h('span', { class: 'muted' }, 'load')) },
      { label: '3Y a year', cls: 'r', render: (r) => chg(r.r3, 1) },
      { label: '5Y a year', cls: 'r', mob: 'hide', render: (r) => chg(r.r5, 1) },
      { label: 'Beat index', cls: 'r', get: (r) => (r.ahead == null ? '–' : (r.ahead * 100).toFixed(0) + '%') },
    ], rows, { onRow: (r) => openFund(r.f.code) }),
    h('p', { class: 'note' }, '“Beat index” is how often the fund’s rolling 3-year return (1-year if the history is short) was ahead of its index. It needs both histories on this device: open a fund to load its index. Tap a fund for the full comparison.'),
    h('div', { class: 'row' }, h('button', { type: 'button', class: 'small', disabled: !!st.busy, onclick: () => loadAll('funds', lab) }, st.busy === 'funds' ? 'Loading…' : 'Reload NAV of all my funds')))));
  return out;
}

function addIndex() {
  formDialog({ title: 'Add an index', fields: [{ key: 'name', label: 'Name', required: true }, { key: 'sym', label: 'Short name (letters and digits)', required: true, hint: 'For example NIFTYALPHA' }, { key: 'yahoo', label: 'Yahoo Finance code', required: true, hint: 'For example ^NSEI or NIFTY_MIDCAP_100.NS. Find it on finance.yahoo.com.' }], saveLabel: 'Add',
    onSave: (v) => { const sym = FD.cleanSym(v.sym); if (!sym) { toast('Enter a short name using letters and digits.', 'bad'); return false; } if (FD.indexBySym(LAB(), sym)) { toast('There is already an index called ' + sym + '.', 'bad'); return false; } return run((l) => { l.indexes = l.indexes || []; l.indexes.push({ id: 'ix' + sym, sym, name: String(v.name).trim(), yahoo: String(v.yahoo).trim(), group: 'Mine' }); }, 'Index added'); } });
}
function indexesTab(lab) {
  const list = FD.indexList(lab), groups = [...new Set(list.map((x) => x.group))];
  const rows = list.map((x) => { const hist = FD.seriesOfIndex(x.sym), q = quote(x.sym); return { x, hist, level: q ? q.price : hist ? hist.c[hist.c.length - 1] : null, r1m: ret(hist, '1M'), r3m: ret(hist, '3M'), r1: ret(hist, '1Y'), r3: ret(hist, '3Y'), r5: ret(hist, '5Y') }; });
  const loaded = rows.filter((r) => r.hist).length, best = rows.filter((r) => r.r1 != null).sort((a, b) => b.r1 - a.r1);
  const out = [section('Index scoreboard', h('div', null,
    h('div', { class: 'row' }, h('button', { type: 'button', class: 'primary', disabled: !!st.busy, onclick: () => loadAll('indexes', lab) }, st.busy === 'indexes' ? 'Loading…' : loaded ? 'Reload all indexes' : 'Load all indexes'), canEdit() ? h('button', { type: 'button', onclick: addIndex }, 'Add an index') : null),
    best.length > 1 ? h('p', { class: 'fx-verdict' }, `Over the last year ${best[0].x.name} led (${(best[0].r1 * 100).toFixed(1)}%) and ${best[best.length - 1].x.name} trailed (${(best[best.length - 1].r1 * 100).toFixed(1)}%), of ${best.length} indexes loaded.`) : null,
    h('p', { class: 'note' }, 'Tap an index for its chart and rolling returns. Yahoo codes for the built-in indexes were set from memory and not checked from here: if one does not load, open it and use Edit code. Nothing loads until you press a button.')))];
  for (const g of groups) {
    const gr = rows.filter((r) => (r.x.group || 'Mine') === g); if (!gr.length) continue;
    out.push(section(g, table([
      { label: 'Index', host: true, get: (r) => r.x.name },
      { label: 'Level', cls: 'r', mob: 'hide', get: (r) => (r.level == null ? '–' : dec(r.level, 2)) },
      { label: '3M', cls: 'r', mob: 'hide', render: (r) => chg(r.r3m, 1) },
      { label: '1Y', cls: 'r', render: (r) => (r.hist ? chg(r.r1, 1) : h('span', { class: 'muted' }, 'load')) },
      { label: '3Y a year', cls: 'r', render: (r) => chg(r.r3, 1) },
      { label: '5Y a year', cls: 'r', mob: 'hide', render: (r) => chg(r.r5, 1) },
      { label: '', cls: 'r', mob: 'hide', render: (r) => (r.hist ? h('span', { class: 'muted' }, ago(HS.dataOf(r.x.sym).ts)) : h('button', { type: 'button', class: 'small', onclick: (e) => { e.stopPropagation(); loadIndexBtn(e.currentTarget, r.x); } }, 'Load')) },
    ], gr, { onRow: (r) => openIndex(r.x.sym) })));
  }
  return out;
}

export function render() {
  const lab = LAB(), root = h('div', { class: 'page' }), tab = subTab(['funds', 'indexes']);
  root.append(segTabs([['funds', 'Mutual funds'], ['indexes', 'Indexes']], tab, 'Funds views'), ...(tab === 'funds' ? fundsTab(lab) : indexesTab(lab)));
  return root;
}
