// Runs every tests/*.test.mjs file and stops on the first failure.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const dir = dirname(fileURLToPath(import.meta.url));
let bad = 0;
for (const f of readdirSync(dir).filter((x) => x.endsWith('.test.mjs')).sort()) {
  const r = spawnSync(process.execPath, [join(dir, f)], { stdio: 'inherit' });
  if (r.status !== 0) { bad++; console.error('FAILED: ' + f); }
}
process.exit(bad ? 1 : 0);
