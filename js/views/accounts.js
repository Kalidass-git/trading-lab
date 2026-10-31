// Trading Lab: accounts. Create, rename, add or take out money, archive, restore and delete virtual accounts.
import * as BK from '../lab/book.js';
import { h, money, pct, num, section, table, btn, rowList, dialog, empty } from '../ui.js';
import { LAB, books, tone, signedRs, rerender, setAcct, rs2 } from './lab-shared.js';
import { accountForm, cashForm, setArchived, deleteAccount } from './lab-trade.js';

function openAccount(b) {
  const a = b.acct, v = b.v;
  dialog(a.name + (a.archived ? ' (archived)' : ''), h('div', null, rowList([
    { title: 'Capital put in', value: money(v.deposited) }, { title: 'Cash', value: money(v.cash) }, { title: 'Holdings', sub: `${v.holdings.length} share${v.holdings.length === 1 ? '' : 's'}`, value: money(v.holdingsValue) }, { title: 'Options', sub: `${v.options.length} contract${v.options.length === 1 ? '' : 's'}`, value: money(v.optionsValue) },
    { title: 'Current value', value: h('b', null, money(v.value)) }, { title: 'Profit / loss', value: h('span', { class: tone(v.pnl) }, signedRs(v.pnl)), valueSub: h('span', { class: tone(v.pnl) }, (v.ret > 0 ? '+' : '') + pct(v.ret, 2)) },
    { title: 'Charges paid', value: rs2(v.fees) }, { title: 'Charges set to', sub: 'brokerage % · flat fee · other %', value: `${a.fees.brokeragePct || 0}% · ₹${a.fees.flat || 0} · ${a.fees.otherPct || 0}%` }])),
    a.archived ? [{ label: 'Delete', class: 'danger', onclick: (c) => { c(); deleteAccount(a); } }, { label: 'Restore', class: 'primary', onclick: (c) => { c(); setArchived(a, false); } }]
      : [{ label: 'Archive', onclick: (c) => { c(); setArchived(a, true); } }, { label: 'Delete', class: 'danger', onclick: (c) => { c(); deleteAccount(a); } }, { label: 'Withdraw', onclick: (c) => { c(); cashForm(a.id, 'withdraw'); } }, { label: 'Add money', onclick: (c) => { c(); cashForm(a.id, 'deposit'); } }, { label: 'Edit', class: 'primary', onclick: (c) => { c(); accountForm(a); } }]);
}

export function render() {
  const lab = LAB(), root = h('div', { class: 'page' }), all = books({ archived: true });
  root.append(h('p', { class: 'note', style: { marginTop: 0 } }, 'Each account has its own cash, holdings, charges and history. All money here is virtual. Tap an account to add money, edit its charges, archive or delete it.'));
  if (!all.length) { root.append(h('div', { class: 'card lab-empty' }, h('p', null, 'No accounts yet.'), btn('New trading account', () => accountForm(), 'primary'))); return root; }
  const group = (title, list) => list.length ? section(title, table([
    { label: 'Account', host: true, render: (b) => h('span', null, b.acct.name, b.acct.archived ? h('small', { class: 'tag' }, 'archived') : null) },
    { label: 'Capital', cls: 'r', get: (b) => money(b.v.deposited) }, { label: 'Cash', cls: 'r', get: (b) => money(b.v.cash) }, { label: 'Value', cls: 'r', get: (b) => money(b.v.value) },
    { label: 'P&L · Return', cls: 'r', render: (b) => h('div', null, h('div', { class: 'b ' + tone(b.v.pnl) }, signedRs(b.v.pnl)), h('div', { class: 'sub2 ' + tone(b.v.pnl) }, (b.v.ret > 0 ? '+' : '') + pct(b.v.ret, 1))) },
  ], list, { onRow: openAccount, m: { key: 'tl-acc-' + title, head: 'Account', sub: (b) => `${b.v.positions} position${b.v.positions === 1 ? '' : 's'}`, views: [['Value', 'Capital'], ['P&L · Return', 'Cash']] } }), title === 'Active accounts' ? [btn('New account', () => accountForm(), 'primary')] : null) : null;
  root.append(group('Active accounts', all.filter((b) => !b.acct.archived)) || section('Active accounts', empty('All accounts are archived.'), [btn('New account', () => accountForm(), 'primary')]), group('Archived accounts', all.filter((b) => b.acct.archived)));
  return root;
}
