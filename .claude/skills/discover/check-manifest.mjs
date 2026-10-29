// Read-only check of a manifest written by the Discover stage.
//
//   node .claude/skills/discover/check-manifest.mjs <app>
//
// Exit code 1 on errors. Warnings are printed but do not fail.

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const app = process.argv[2];
if (!app) { console.error('usage: node .claude/skills/discover/check-manifest.mjs <app>'); process.exit(2); }
const file = path.join('manifests', `${app}.manifest.json`);
const errors = [], warnings = [];
const err = m => errors.push(m), warn = m => warnings.push(m);

if (!existsSync(file)) { console.error(`ERROR ${file} not found`); process.exit(1); }
let m;
try { m = JSON.parse(readFileSync(file, 'utf8')); }
catch (e) { console.error(`ERROR ${file} is not valid JSON: ${e.message}`); process.exit(1); }

for (const k of ['manifestVersion', 'app', 'baseUrl', 'generatedBy', 'generatedAt', 'pages', 'forms', 'signals', 'tools', 'businessRules'])
  if (!(k in m)) err(`missing top-level key "${k}"`);
if (m.app && m.app !== app) err(`"app" is "${m.app}", file name says "${app}"`);
for (const s of m.sources || []) if (!existsSync(s)) warn(`source file ${s} not found`);

const pages = m.pages || {}, forms = m.forms || {}, signals = m.signals || {}, tools = m.tools || {};

for (const [name, f] of Object.entries(forms)) {
  if (!pages[f.page]) err(`form ${name}: page "${f.page}" not in pages`);
  if (!f.selector) err(`form ${name}: no selector`);
  if (!f.submit?.selector) err(`form ${name}: no submit selector`);
  for (const [fld, d] of Object.entries(f.fields || {})) if (!d.selector) err(`form ${name}: field ${fld} has no selector`);
}
for (const [name, s] of Object.entries(signals)) {
  if (!pages[s.page]) err(`signal ${name}: page "${s.page}" not in pages`);
  if (!s.result?.outcome) err(`signal ${name}: no result.outcome`);
}
for (const [name, t] of Object.entries(tools)) {
  if (!name.startsWith(app + '.')) warn(`tool ${name}: name should start with "${app}."`);
  if (!pages[t.page]) err(`tool ${name}: page "${t.page}" not in pages`);
  if (!Array.isArray(t.steps) || !t.steps.length) err(`tool ${name}: no steps`);
  if (t.kind === 'write' && t.confirm !== true) err(`tool ${name}: write tools need "confirm": true`);
  if (t.form && !forms[t.form]) err(`tool ${name}: form "${t.form}" not in forms`);
  for (const st of t.steps || []) for (const sig of st.waitFor || []) if (!signals[sig]) err(`tool ${name}: waitFor "${sig}" not in signals`);
}

const OPS = { lt: (v, t) => v < t, lte: (v, t) => v <= t, gt: (v, t) => v > t, gte: (v, t) => v >= t, eq: (v, t) => v === t };
const matches = (when, inputs) => Object.entries(when).every(([k, c]) =>
  k in inputs && Object.entries(c).every(([op, t]) => OPS[op]?.(Number(inputs[k]), t)));

for (const [name, rs] of Object.entries(m.businessRules || {})) {
  const tool = tools[rs.tool];
  if (!tool) { err(`rules ${name}: tool "${rs.tool}" not in tools`); continue; }
  const props = tool.input?.properties || {};
  for (const k of Object.keys(rs.fixedInputs || {})) if (!(k in props)) err(`rules ${name}: fixed input "${k}" not in ${rs.tool} input`);
  if (!Array.isArray(rs.rules) || !rs.rules.length) { err(`rules ${name}: no rules`); continue; }
  const observed = (rs.observed || []).map(o => ({ ...(rs.fixedInputs || {}), ...o }));
  for (const r of rs.rules) {
    if (!r.id || !r.when || !r.outcome) { err(`rules ${name}: a rule lacks id, when or outcome`); continue; }
    for (const [k, c] of Object.entries(r.when)) {
      if (!(k in props)) err(`rule ${r.id}: input "${k}" not in ${rs.tool} input`);
      for (const [op, t] of Object.entries(c)) {
        if (!OPS[op]) err(`rule ${r.id}: unknown operator "${op}"`);
        if (typeof t !== 'number') err(`rule ${r.id}: threshold for ${k}.${op} must be a number`);
      }
    }
    const hits = observed.filter(o => matches(r.when, o));
    if (!hits.length) warn(`rule ${r.id}: no observed probe inside this rule`);
    else if (!hits.some(o => o.outcome === r.outcome)) err(`rule ${r.id}: probes inside this rule never showed "${r.outcome}"`);
    else if (hits.some(o => o.outcome !== r.outcome)) err(`rule ${r.id}: a probe inside this rule contradicts it`);
  }
  for (let i = 0; i < rs.rules.length; i++) for (let j = i + 1; j < rs.rules.length; j++) {
    const a = rs.rules[i], b = rs.rules[j];
    if (a.outcome !== b.outcome && observed.some(o => matches(a.when, o) && matches(b.when, o)))
      err(`rules ${a.id} and ${b.id} overlap with different outcomes`);
  }
}

for (const w of warnings) console.log(`WARN  ${w}`);
for (const e of errors) console.log(`ERROR ${e}`);
const n = Object.keys(m.businessRules || {}).reduce((s, k) => s + (m.businessRules[k].rules?.length || 0), 0);
console.log(`${file}: ${Object.keys(tools).length} tools, ${n} rules - ${errors.length} errors, ${warnings.length} warnings`);
process.exit(errors.length ? 1 : 0);
