// Trading Lab: the .xlsx writer produces a real zip with the right parts. node tests/lab-xlsx.test.mjs
import { workbook } from '../js/lab/xlsxout.js';
import fs from 'node:fs';
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } else console.log('ok  ', m); };
const bytes = workbook([{ name: 'Trades: 2026/10', cols: [['d', 'Date'], ['n', 'Name'], ['amt', 'Amount']], rows: [{ d: '2026-10-01', n: 'A & B <x>', amt: 1234.5 }, { d: '2026-10-02', n: '', amt: -7 }] }, { name: 'Empty', cols: [['a', 'A']], rows: [] }]);
fs.writeFileSync('/tmp/tl-test.xlsx', bytes);
ok(bytes[0] === 0x50 && bytes[1] === 0x4b, 'starts as a zip');
const { execFileSync } = await import('node:child_process');
let listing = ''; try { listing = execFileSync('python3', ['-c', "import zipfile,sys;z=zipfile.ZipFile('/tmp/tl-test.xlsx');print(z.testzip());print('|'.join(z.namelist()));print(z.read('xl/worksheets/sheet1.xml').decode())"]).toString(); } catch (e) { listing = String(e); }
ok(/^None/.test(listing), 'every file in the zip passes its CRC check');
ok(listing.includes('xl/workbook.xml') && listing.includes('xl/worksheets/sheet2.xml'), 'workbook and both sheets are present');
ok(listing.includes('A &amp; B &lt;x&gt;') && listing.includes('<v>1234.5</v>') && listing.includes('<v>-7</v>'), 'text is escaped and numbers stay numbers');
let opened = 'skipped'; try { opened = execFileSync('python3', ['-c', "import openpyxl;wb=openpyxl.load_workbook('/tmp/tl-test.xlsx');ws=wb.worksheets[0];print(wb.sheetnames, ws['C2'].value, ws['B2'].value)"]).toString().trim(); } catch (e) { /* openpyxl may be missing */ }
console.log('openpyxl:', opened);
if (opened !== 'skipped') ok(opened.includes("Trades  2026 10") && opened.includes('1234.5') && opened.includes('A & B <x>'), 'a spreadsheet library opens it and reads the values (sheet name cleaned of / and :)');
console.log(bad ? bad + ' failed' : 'all passed'); process.exit(bad ? 1 : 0);
