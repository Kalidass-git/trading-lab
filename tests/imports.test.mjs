// Every relative import in the app must point at a real file, and every named import must be exported by it.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = [];
for (const d of ['js', 'js/lab', 'js/views']) for (const f of readdirSync(join(root, d))) if (f.endsWith('.js')) files.push(join(root, d, f));
const exportsOf = (file) => {
  const s = readFileSync(file, 'utf8'), out = new Set();
  for (const m of s.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z0-9_$]+)/g)) out.add(m[1]);
  for (const m of s.matchAll(/export\s*\{([^}]*)\}/g)) for (const n of m[1].split(',')) { const p = n.trim().split(/\s+as\s+/); if (p[0]) out.add((p[1] || p[0]).trim()); }
  return out;
};
let bad = 0;
const fail = (m) => { bad++; console.error('✗ ' + m); };
for (const f of files) {
  const s = readFileSync(f, 'utf8');
  for (const m of s.matchAll(/import\s+(?:(\*\s+as\s+\w+)|\{([^}]*)\}|(\w+))?\s*(?:,\s*\{([^}]*)\})?\s*from\s+'(\.[^']+)'/g)) {
    const target = resolve(dirname(f), m[5]);
    if (!existsSync(target)) { fail(`${f}: missing ${m[5]}`); continue; }
    const ex = exportsOf(target);
    for (const list of [m[2], m[4]]) if (list) for (const n of list.split(',')) { const name = n.trim().split(/\s+as\s+/)[0].trim(); if (name && !ex.has(name)) fail(`${f.replace(root + '/', '')}: '${name}' is not exported by ${m[5]}`); }
  }
  if (/Family Wealth|familywealth|portfolio-data/i.test(s)) fail(`${f}: leftover Family Wealth text`);
}
// every file the service worker lists must exist, and every js file must be listed
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
const listed = [...sw.matchAll(/'\.\/([^']+)'/g)].map((m) => m[1]);
for (const p of listed) if (!existsSync(join(root, p))) fail(`sw.js lists a missing file ${p}`);
for (const f of files) { const rel = f.replace(root + '/', ''); if (!listed.includes(rel)) fail(`sw.js does not cache ${rel}`); }
if (bad) { console.error(bad + ' problem(s)'); process.exit(1); }
console.log('imports ok: ' + files.length + ' modules');
