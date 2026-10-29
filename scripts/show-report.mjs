// Show the Playwright HTML report in Chrome and stop the report server again.
//
//   node scripts/show-report.mjs [minutes]   -> default 10
//
// Starts `playwright show-report` (a local web server on port 9323), opens the
// report in Google Chrome and stops the server after the given time. Screenshots
// and traces are loaded from the server on click, so it has to stay up while the
// report is being looked at. If a report server is running already, the report is
// only opened and that server is left alone.
// Called by the /inject-execute skill; no AI involved.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const minutes = Number(process.argv[2] ?? 10);
if (!(minutes > 0)) { console.error('usage: node scripts/show-report.mjs [minutes]'); process.exit(2); }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = 'http://localhost:9323';

const isUp = () => fetch(url).then(r => r.ok, () => false);
const openChrome = () => spawn('open', ['-a', 'Google Chrome', url], { stdio: 'ignore' });

if (await isUp()) {
  openChrome();
  console.log(`Report server is running already - opened ${url} in Chrome, server left alone.`);
  process.exit(0);
}

const server = spawn(path.join(root, 'node_modules', '.bin', 'playwright'), ['show-report'], { cwd: root, stdio: 'ignore' });
const stop = code => { server.kill(); process.exit(code); };
server.on('exit', code => { console.error(`Report server ended early (exit code ${code}).`); process.exit(1); });
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

for (let i = 0; i < 50 && !(await isUp()); i++) await new Promise(r => setTimeout(r, 200));
if (!(await isUp())) { console.error(`Report server did not start on ${url}.`); server.removeAllListeners('exit'); stop(1); }

openChrome();
console.log(`Report open in Chrome: ${url} - the server stops in ${minutes} minutes.`);
setTimeout(() => {
  server.removeAllListeners('exit');
  console.log('Report server stopped.');
  stop(0);
}, minutes * 60_000);
