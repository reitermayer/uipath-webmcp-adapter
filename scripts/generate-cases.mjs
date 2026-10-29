// Generate boundary test cases from the business rules in a manifest.
//
//   node scripts/generate-cases.mjs <app>
//
// For every rule set in manifest.businessRules: collect the numeric thresholds
// of each input, take the values on both sides of every threshold, combine
// them, and evaluate the documented rules to get the expected outcome.
// Combinations no rule covers are written as "gaps" - never guessed.
// Output: tests/cases/<app>.<ruleSet>.cases.json, plus one test() line per case in every
// spec that has a matching <generated-cases> block.

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = process.argv[2];
if (!app) { console.error('usage: node scripts/generate-cases.mjs <app>'); process.exit(2); }
const manifestFile = path.join('manifests', `${app}.manifest.json`);
const manifest = JSON.parse(readFileSync(path.join(root, manifestFile), 'utf8'));

const OPS = {
  lt: (v, t) => v < t, lte: (v, t) => v <= t,
  gt: (v, t) => v > t, gte: (v, t) => v >= t,
  eq: (v, t) => v === t
};

// Values just on each side of a threshold (integer inputs).
function edges(op, t) {
  if (op === 'lt' || op === 'gte') return [t - 1, t];
  if (op === 'lte' || op === 'gt') return [t, t + 1];
  return [t - 1, t, t + 1];
}

function matches(rule, inputs) {
  return Object.entries(rule.when).every(([k, cond]) =>
    Object.entries(cond).every(([op, t]) => OPS[op](inputs[k], t)));
}

function cartesian(dims) {
  return dims.reduce((acc, [k, vals]) =>
    acc.flatMap(row => vals.map(v => ({ ...row, [k]: v }))), [{}]);
}

const fmt = n => String(n);

mkdirSync(path.join(root, 'tests', 'cases'), { recursive: true });

for (const [name, rs] of Object.entries(manifest.businessRules || {})) {
  if (!rs.rules || !rs.tool) continue;

  const values = {};
  for (const rule of rs.rules) {
    for (const [k, cond] of Object.entries(rule.when)) {
      for (const [op, t] of Object.entries(cond)) {
        if (!OPS[op]) throw new Error(`${rule.id}: unknown operator ${op}`);
        (values[k] ||= new Set());
        edges(op, t).forEach(v => values[k].add(v));
      }
    }
  }
  const dims = Object.entries(values).map(([k, s]) => [k, [...s].sort((a, b) => a - b)]);

  const cases = [], gaps = [];
  for (const inputs of cartesian(dims)) {
    const hits = rs.rules.filter(r => matches(r, inputs));
    const label = Object.entries(inputs).map(([k, v]) => `${k} ${fmt(v)}`).join(', ');
    if (hits.length === 0) { gaps.push({ inputs, note: 'No documented rule covers this combination' }); continue; }
    const outcomes = [...new Set(hits.map(r => r.outcome))];
    if (outcomes.length > 1) throw new Error(`Rules ${hits.map(r => r.id)} conflict for ${label}`);
    cases.push({
      id: `${name}-${cases.length + 1}`,
      title: `${label} is ${outcomes[0]} [${hits.map(r => r.id).join(', ')}]`,
      tags: ['@boundary', ...hits.map(r => '@' + r.id)],
      inputs,
      expected: { outcome: outcomes[0] },
      rules: hits.map(r => r.id)
    });
  }

  for (const s of rs.smoke || []) {
    cases.unshift({
      id: `${name}-smoke-${(rs.smoke.indexOf(s) + 1)}`,
      title: s.title + (s.rule ? ` [${s.rule}]` : ''),
      tags: ['@smoke', ...(s.rule ? ['@' + s.rule] : [])],
      inputs: s.inputs,
      expected: { outcome: s.outcome },
      rules: s.rule ? [s.rule] : []
    });
  }

  const out = {
    generatedBy: 'scripts/generate-cases.mjs',
    source: manifestFile,
    app: manifest.app,
    ruleSet: name,
    suite: rs.suite || name,
    tool: rs.tool,
    fixedInputs: rs.fixedInputs || {},
    rules: rs.rules.map(({ id, text, outcome }) => ({ id, text, outcome })),
    boundaryValues: Object.fromEntries(dims),
    cases,
    gaps
  };
  const file = path.join('tests', 'cases', `${app}.${name}.cases.json`);
  writeFileSync(path.join(root, file), JSON.stringify(out, null, 2) + '\n');
  console.log(`${file}: ${cases.length} cases, ${gaps.length} gaps`);
  writeSpecLines(`${app}.${name}.cases.json`, cases);
}

// Specs list their cases one test() per line between
//   // <generated-cases file="<cases file>">  ...  // </generated-cases>
// Test Manager selects a test by file:line, so a loop would run all cases at once.
function writeSpecLines(casesFile, cases) {
  const testsDir = path.join(root, 'tests');
  const block = new RegExp(`^([ \\t]*)// <generated-cases file="${casesFile.replace(/\./g, '\\.')}">\\n[\\s\\S]*?^[ \\t]*// </generated-cases>`, 'm');
  for (const f of readdirSync(testsDir).filter(f => f.endsWith('.spec.js'))) {
    const src = readFileSync(path.join(testsDir, f), 'utf8');
    const m = src.match(block);
    if (!m) continue;
    const call = src.match(/function (\w+)\(id\)/)?.[1];
    if (!call) throw new Error(`tests/${f}: no case function "function <name>(id)" found`);
    const ind = m[1];
    const lines = cases.map(c => `${ind}test(...${call}('${c.id}'));`);
    const next = src.replace(block, [`${ind}// <generated-cases file="${casesFile}">`, ...lines, `${ind}// </generated-cases>`].join('\n'));
    writeFileSync(path.join(testsDir, f), next);
    console.log(`tests/${f}: ${cases.length} test lines`);
  }
}
