// Pack the Playwright suite for Test Manager from a clean staging folder:
// dist/tm/WebMCPAdapter.<App>.<version>.nupkg
//
//   node scripts/pack-tm.mjs <app> <version> [--dry-run]
//
// Only what the tests need goes into the package - no CLAUDE.md, docs,
// discovery raw output or TM key mappings (*.tm.json). Upload is a separate,
// deliberate step: uip or packages upload <nupkg> --output json

import { cpSync, mkdirSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { root } from '../tests/support/webmcp.js';
import { tm } from './tm-config.mjs';

const [app, version] = process.argv.slice(2);
const dryRun = process.argv.includes('--dry-run');
if (!app || !version || version.startsWith('--')) {
  console.error('usage: node scripts/pack-tm.mjs <app> <version> [--dry-run]'); process.exit(2);
}
const App = app[0].toUpperCase() + app.slice(1).replace(/bank$/, 'Bank');
const name = tm.package.id || `WebMCPAdapter.${App}`;

const stage = path.join(root, 'dist', 'tm-stage', app);
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });

const copy = (rel, filter) => cpSync(path.join(root, rel), path.join(stage, rel), { recursive: true, filter });
['package.json', 'package-lock.json', 'playwright.config.js', 'runtime'].forEach(rel => copy(rel));
copy(path.join('manifests', `${app}.manifest.json`));
copy('tests', src => !src.endsWith('.tm.json') && (!src.includes(`${path.sep}cases${path.sep}`) || path.basename(src).startsWith(`${app}.`)));
const specs = readdirSync(path.join(stage, 'tests')).filter(f => f.endsWith('.spec.js'));
for (const f of specs) if (!f.startsWith(`${app}.`)) rmSync(path.join(stage, 'tests', f));
if (!existsSync(path.join(root, 'node_modules'))) { console.error('run npm install first'); process.exit(1); }

const args = ['tm', 'pack', '--project-path', stage, '--type', 'playwright',
  '--project-key', tm.project.key, '--name', name, '--package-version', version,
  '--author', tm.package.author,
  '--description', `${App} tests via injected WebMCP tools (Playwright)`,
  '-o', path.join(root, 'dist', 'tm'), '--output', 'json'];
if (dryRun) args.push('--dry-run');
console.log(execFileSync('uip', args, { encoding: 'utf8' }));
