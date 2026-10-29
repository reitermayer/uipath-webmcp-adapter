// Set aside the results of a pipeline stage so it can run again from scratch.
//
//   node scripts/set-aside.mjs discover   -> discovery/*, manifests/*
//   node scripts/set-aside.mjs generate   -> tests/cases/*.cases.json and the
//                                            generated test() lines in tests/*.spec.js
//
// Nothing is deleted: files are moved into backup/runs/<timestamp>/ (ignored by Git).
// Test Manager key files (tests/cases/*.tm.json) are never touched.
// Called by the /discover and /generate skills; no AI involved.

import { readdirSync, mkdirSync, renameSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const stage = process.argv[2];
if (!['discover', 'generate'].includes(stage)) {
  console.error('usage: node scripts/set-aside.mjs discover|generate'); process.exit(2);
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pad = n => String(n).padStart(2, '0');
const d = new Date();
const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
let runDir = path.join('backup', 'runs', `${stamp}-${stage}`);
for (let i = 2; existsSync(path.join(root, runDir)); i++) runDir = path.join('backup', 'runs', `${stamp}-${stage}-${i}`);
const moved = [];

function setAside(rel) {
  const to = path.join(root, runDir, rel);
  mkdirSync(path.dirname(to), { recursive: true });
  if (existsSync(to)) throw new Error(`${to} exists already`);
  renameSync(path.join(root, rel), to);
  moved.push(rel);
}

if (stage === 'discover') {
  for (const dir of ['discovery', 'manifests']) {
    mkdirSync(path.join(root, dir), { recursive: true });
    for (const f of readdirSync(path.join(root, dir)).filter(f => !f.startsWith('.'))) setAside(path.join(dir, f));
  }
}

if (stage === 'generate') {
  const casesDir = path.join('tests', 'cases');
  mkdirSync(path.join(root, casesDir), { recursive: true });
  for (const f of readdirSync(path.join(root, casesDir)).filter(f => f.endsWith('.cases.json'))) setAside(path.join(casesDir, f));
  // Empty the generated blocks in the specs (a copy of each changed spec goes to the run folder).
  const block = /^([ \t]*\/\/ <generated-cases file="[^"]+">\n)[\s\S]*?(^[ \t]*\/\/ <\/generated-cases>)/gm;
  for (const f of readdirSync(path.join(root, 'tests')).filter(f => f.endsWith('.spec.js'))) {
    const rel = path.join('tests', f), src = readFileSync(path.join(root, rel), 'utf8');
    const next = src.replace(block, '$1$2');
    if (next === src) continue;
    const copy = path.join(root, runDir, rel);
    mkdirSync(path.dirname(copy), { recursive: true });
    writeFileSync(copy, src);
    writeFileSync(path.join(root, rel), next);
    moved.push(`${rel} (generated test lines emptied)`);
  }
}

for (const m of moved) console.log(`set aside ${m}`);
console.log(moved.length
  ? `${moved.length} item(s) set aside in ${runDir}/ - ready for /${stage}.`
  : `Nothing to set aside - ready for /${stage}.`);
