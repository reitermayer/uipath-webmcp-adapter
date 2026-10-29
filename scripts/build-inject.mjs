// Bundle runtime + manifest into one injectable file: dist/webmcp-<app>.js
//
//   node scripts/build-inject.mjs <app>
//
// For browsers where addInitScript is not available (a user's own Chrome,
// UiPath Inject Js Script). Safe to inject repeatedly: the runtime is guarded
// and register() replaces the manifest.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { root, loadManifest } from '../tests/support/webmcp.js';

const app = process.argv[2];
if (!app) { console.error('usage: node scripts/build-inject.mjs <app>'); process.exit(2); }

const runtime = readFileSync(path.join(root, 'runtime', 'webmcp-runtime.js'), 'utf8');
const manifest = loadManifest(app);
const bundle = `${runtime}\n;window.__webmcp.register(${JSON.stringify(manifest)});\n`;

mkdirSync(path.join(root, 'dist'), { recursive: true });
const file = path.join('dist', `webmcp-${app}.js`);
writeFileSync(path.join(root, file), bundle);
console.log(`${file} (${bundle.length} bytes)`);
