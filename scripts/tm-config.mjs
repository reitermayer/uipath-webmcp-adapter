// Read the central Test Manager settings from testmanager.json (repo root).
// testmanager.local.json (ignored by Git), if present, overrides it section by section.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { root } from '../tests/support/webmcp.js';

const read = name => JSON.parse(readFileSync(path.join(root, name), 'utf8'));
const base = read('testmanager.json');
const local = existsSync(path.join(root, 'testmanager.local.json')) ? read('testmanager.local.json') : {};
export const tm = Object.fromEntries([...new Set([...Object.keys(base), ...Object.keys(local)])]
  .map(k => [k, base[k] && local[k] && typeof base[k] === 'object' ? { ...base[k], ...local[k] } : local[k] ?? base[k]]));
