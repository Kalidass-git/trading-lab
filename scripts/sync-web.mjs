// Copies the web app into www/ so Capacitor can pack it into the Android app.
// The web app itself has no build step: this only copies the files the phone needs.
// Never copies data files, tests, backend or docs.
import { cp, rm, mkdir, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'www');
const COPY = ['index.html', 'manifest.webmanifest', 'css', 'js', 'icons'];

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const name of COPY) await cp(join(root, name), join(out, name), { recursive: true });

// A safety net: refuse to continue if anything that looks like private data slipped in.
async function walk(dir) {
  for (const e of await readdir(dir)) {
    const p = join(dir, e);
    if ((await stat(p)).isDirectory()) { await walk(p); continue; }
    if (/portfolio-data|backup.*\.json$|\.xlsx?$|\.csv$/i.test(e)) throw new Error('Private-looking file in the app copy: ' + p);
  }
}
await walk(out);
console.log('Copied the web app to www/');
