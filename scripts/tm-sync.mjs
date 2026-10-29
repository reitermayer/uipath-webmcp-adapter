// Create the generated test cases in Test Manager and keep them in one test set.
//
//   node scripts/tm-sync.mjs <cases-name> [PROJECT_KEY]   (default: testmanager.json)
//   node scripts/tm-sync.mjs uibank.loanDecision WEBMCP
//
// Idempotent: matches test cases by name ("<suite> > <title>", the same shape
// Test Manager's own Playwright import uses), creates only missing ones, adds
// labels, and makes sure all of them are in the test set "<suite> (Playwright)".
// Writes tests/cases/<cases-name>.tm.json, which the TM reporter reads.

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { root, loadCases } from '../tests/support/webmcp.js';
import { uip } from '../tests/support/uip.js';
import { tm } from './tm-config.mjs';

const [casesName, projectKeyArg] = process.argv.slice(2);
const projectKey = projectKeyArg || tm.project.key;
if (!casesName || !projectKey) {
  console.error('usage: node scripts/tm-sync.mjs <cases-name> <PROJECT_KEY>');
  process.exit(2);
}

const suite = loadCases(`${casesName}.cases.json`);
const tcName = c => `${suite.suite} > ${c.title}`;

const existing = new Map(uip(['tm', 'testcases', 'list', '--project-key', projectKey]).map(t => [t.Name, t]));
const testCases = {};
for (const c of suite.cases) {
  let tc = existing.get(tcName(c));
  if (!tc) {
    tc = uip(['tm', 'testcases', 'create', '--project-key', projectKey, '--name', tcName(c),
      '--description', `Generated from ${suite.source} (${suite.ruleSet}). Rules: ${c.rules.join(', ')}. Inputs: ${JSON.stringify(c.inputs)}. Expected: ${c.expected.outcome}.`]);
    console.log(`created ${tc.TestCaseKey} ${tc.Name}`);
  } else {
    console.log(`exists  ${tc.TestCaseKey} ${tc.Name}`);
  }
  const labels = [suite.app, suite.ruleSet, ...c.tags.map(t => t.replace(/^@/, ''))];
  uip(['tm', 'objectlabel', 'add', '--project-key', projectKey, '--object-type', 'TestCase', '--object-ids', tc.Id, '--labels', ...labels]);
  testCases[c.title] = { key: tc.TestCaseKey, id: tc.Id };
}

const setName = `${suite.suite} (Playwright)`;
let set = uip(['tm', 'testsets', 'list', '--project-key', projectKey, '--filter', setName]).find(s => s.Name === setName);
if (!set) {
  set = uip(['tm', 'testsets', 'create', '--project-key', projectKey, '--name', setName,
    '--description', `Playwright + WebMCP adapter run locally; results reported by tests/support/tm-reporter.js`]);
  console.log(`created test set ${set.TestSetKey} ${setName}`);
}
const inSet = new Set(uip(['tm', 'testsets', 'list-testcases', '--project-key', projectKey, '--test-set-key', set.TestSetKey]).map(t => t.TestCaseKey));
const missing = Object.values(testCases).map(t => t.key).filter(k => !inSet.has(k));
if (missing.length) {
  uip(['tm', 'testcases', 'add', '--test-set-key', set.TestSetKey, '--test-case-keys', ...missing]);
  console.log(`added ${missing.join(', ')} to ${set.TestSetKey}`);
}

const file = path.join('tests', 'cases', `${casesName}.tm.json`);
writeFileSync(path.join(root, file), JSON.stringify({
  projectKey, testSetKey: set.TestSetKey, testSetName: setName, suite: suite.suite, testCases
}, null, 2) + '\n');
console.log(`wrote ${file}`);
