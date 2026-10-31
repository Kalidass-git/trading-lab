// Runs the Gradle wrapper in android/ on Windows, Mac or Linux:  node scripts/gradle.mjs assembleDebug
// Gradle in this project runs on Java 21 to 24. Newer Java (25 and up) fails with "Unsupported class file major version",
// so if the Java on your PATH is too new, this looks for the Java that ships with Android Studio and uses that instead.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, delimiter } from 'node:path';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'android');
const win = process.platform === 'win32', mac = process.platform === 'darwin';
const args = process.argv.slice(2);
if (!args.length) { console.error('Say what to build, for example: assembleDebug'); process.exit(1); }
if (!existsSync(join(dir, win ? 'gradlew.bat' : 'gradlew'))) { console.error('The Gradle wrapper is missing in android/.'); process.exit(1); }

const MIN = 21, MAX = 24;
/** Major version of the Java in a given home folder (or the one on PATH when home is null). 0 when it cannot be run. */
function javaMajor(home) {
  const exe = home ? join(home, 'bin', win ? 'java.exe' : 'java') : 'java';
  if (home && !existsSync(exe)) return 0;
  const r = spawnSync(exe, ['-version'], { encoding: 'utf8', shell: !home && win });
  const m = /version "(\d+)(?:\.(\d+))?/.exec((r.stderr || '') + (r.stdout || ''));
  if (!m) return 0;
  return m[1] === '1' ? Number(m[2]) : Number(m[1]);
}

const env = { ...process.env };
const current = javaMajor(env.JAVA_HOME || null);
if (current < MIN || current > MAX) {
  const pf = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], 'C:\\Program Files'].filter(Boolean);
  const local = process.env.LOCALAPPDATA ? [join(process.env.LOCALAPPDATA, 'Programs', 'Android Studio', 'jbr')] : [];
  const candidates = win ? [...pf.flatMap((p) => [join(p, 'Android', 'Android Studio', 'jbr'), join(p, 'Android', 'Android Studio Preview', 'jbr')]), ...local]
    : mac ? ['/Applications/Android Studio.app/Contents/jbr/Contents/Home', '/Applications/Android Studio Preview.app/Contents/jbr/Contents/Home']
    : ['/opt/android-studio/jbr', join(homedir(), 'android-studio', 'jbr'), '/usr/local/android-studio/jbr', '/snap/android-studio/current/android-studio/jbr'];
  const found = candidates.find((c) => { const v = javaMajor(c); return v >= MIN && v <= MAX; });
  if (found) {
    env.JAVA_HOME = found;
    env.PATH = join(found, 'bin') + delimiter + (env.PATH || '');
    console.log(`Your Java is ${current || 'not found'}; using Android Studio's Java instead (${found}).`);
  } else {
    console.error(`\nThis build needs Java ${MIN} to ${MAX}, but your Java is ${current || 'not found'}.\n` +
      `Fix: install Android Studio (it includes Java 21), then run this again, or set JAVA_HOME to a JDK ${MIN} folder.\n` +
      (win ? 'Android Studio\'s Java is usually in C:\\Program Files\\Android\\Android Studio\\jbr\n' : ''));
    process.exit(1);
  }
}

const r = spawnSync(win ? 'gradlew.bat' : './gradlew', args, { cwd: dir, stdio: 'inherit', shell: win, env });
if (r.status === 0) {
  const kind = args.some((a) => /release/i.test(a)) ? 'release' : 'debug';
  console.log(`\nDone. Your APK is in android/app/build/outputs/apk/${kind}/`);
}
process.exit(r.status ?? 1);
