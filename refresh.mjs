/**
 * refresh.mjs — one command to keep the pipeline current. Runs the scan, then a
 * bounded liveness re-check, and prints a single timestamped summary. Designed
 * to be run on a cadence (Windows Task Scheduler / cron) — it never hard-fails
 * on a partial error so an automated run won't wedge.
 *
 *   node refresh.mjs                 # scan + liveness sweep (default)
 *   node refresh.mjs --max-age-days 30 --liveness-limit 20
 *   node refresh.mjs --no-liveness   # scan only
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : def;
};
const maxAge = flag('--max-age-days', '30');
const livenessLimit = flag('--liveness-limit', '15');
const noLiveness = args.includes('--no-liveness');

function run(label, file, fileArgs) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [path.join(ROOT, file), ...fileArgs], { cwd: ROOT });
    let tail = '';
    const cap = (buf) => { tail = (tail + buf.toString()).slice(-4000); };
    child.stdout.on('data', cap);
    child.stderr.on('data', cap);
    child.on('close', (code) => {
      const secs = ((Date.now() - started) / 1000).toFixed(0);
      resolve({ label, code, secs, tail });
    });
    child.on('error', (err) => resolve({ label, code: -1, secs: '0', tail: err.message }));
  });
}

function pick(tail, re) {
  const m = tail.match(re);
  return m ? m[0] : null;
}

const stamp = new Date().toISOString();
console.log(`\n━━ career-ops refresh — ${stamp} ━━`);

const scan = await run('scan', 'scan.mjs', ['--max-age-days', maxAge]);
const added = pick(scan.tail, /New offers added:\s*\d+/) || 'New offers: ?';
const merged = pick(scan.tail, /Cross-source merges:\s*\d+/) || '';
const errs = pick(scan.tail, /Errors \(\d+\)/) || 'Errors (0)';
console.log(`scan        ${scan.code === 0 ? 'ok' : 'EXIT ' + scan.code} (${scan.secs}s) · ${added}${merged ? ' · ' + merged : ''} · ${errs}`);

if (!noLiveness) {
  const live = await run('liveness', 'liveness-sweep.mjs', ['--limit', livenessLimit]);
  const verdict = pick(live.tail, /re-verified:.*$/m) || pick(live.tail, /liveness store:.*$/m) || 'liveness: ?';
  console.log(`liveness    ${live.code === 0 ? 'ok' : 'EXIT ' + live.code} (${live.secs}s) · ${verdict.trim()}`);
}

console.log(`done — open the dashboard or run /career-ops pipeline.\n`);
// Always succeed for the scheduler; failures are surfaced in the summary above.
process.exit(0);
