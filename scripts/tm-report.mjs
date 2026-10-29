// Stage 5 - Report: run the generated tests in UiPath Test Manager (serverless).
// All settings come from testmanager.json; the login from `uip login`.
//
//   node scripts/tm-report.mjs plan            show what publish would do (changes nothing)
//   node scripts/tm-report.mjs publish         create the test set if it is missing -> pack -> upload ->
//                                              wait for Test Manager to create the test cases ->
//                                              add them to the test set
//   node scripts/tm-report.mjs run             run the test set on the serverless robot (a new
//                                              execution every time) and wait
//
// Called by the /report skill; no AI involved. Nothing in Test Manager is deleted -
// old test cases and test sets are removed by hand before a demo, so the test set is
// found by its name and created again when it is gone.

import { readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { root } from '../tests/support/webmcp.js';
import { uip } from '../tests/support/uip.js';
import { tm } from './tm-config.mjs';

const cmd = process.argv[2];
const P = tm.project.key, app = tm.package.app, setName = tm.testSet.name;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const out = o => console.log(JSON.stringify(o, null, 2));

// Say what happens next and show the uip call behind it, then make the call.
const quote = a => /\s/.test(a) ? `"${a}"` : a;
const step = text => console.log(`\n-> ${text}`);
const via = (text, args) => { step(text); console.log(`   $ uip ${args.map(quote).join(' ')}`); return uip(args); };

const listCases = () => uip(['tm', 'testcases', 'list', '--project-key', P]);
const findSet = () => uip(['tm', 'testsets', 'list', '--project-key', P, '--filter', setName]).find(s => s.Name === setName);

// Number of test() lines the package will create test cases for.
function expectedTests() {
  return readdirSync(path.join(root, 'tests', 'cases'))
    .filter(f => f.startsWith(`${app}.`) && f.endsWith('.cases.json'))
    .reduce((n, f) => n + JSON.parse(readFileSync(path.join(root, 'tests', 'cases', f), 'utf8')).cases.length, 0);
}

function nextVersion() {
  let versions = [];
  try { versions = uip(['or', 'packages', 'versions', tm.package.id]).map(v => v.Version).filter(Boolean); } catch { /* new package */ }
  const parts = versions.map(v => v.split('.').map(Number)).filter(v => v.length === 3 && v.every(Number.isFinite));
  if (!parts.length) return '1.0.0';
  parts.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  const [a, b, c] = parts.at(-1);
  return `${a}.${b}.${c + 1}`;
}

if (cmd === 'plan') {
  const cases = listCases(), set = findSet();
  out({
    tenant: `${tm.tenant.organization}/${tm.tenant.name}`, user: uip(['login', 'status']).UserEmail,
    project: P, testSet: set ? `${set.TestSetKey}  ${setName}` : `${setName} (will be created)`, package: tm.package.id, nextVersion: nextVersion(),
    testsInPackage: expectedTests(),
    existingTestCases: cases.map(c => `${c.TestCaseKey}  ${c.Name}`)
  });
} else if (cmd === 'publish') {
  const version = nextVersion();
  let set = findSet();
  const setCreated = !set;
  if (!set) set = via(`Test set "${setName}" is missing - create it in Test Manager`, ['tm', 'testsets', 'create', '--project-key', P, '--name', setName, '--description', tm.testSet.description]);
  const setKey = set.TestSetKey;
  const before = new Set(listCases().map(c => c.TestCaseKey));
  step(`Pack the tests into package ${tm.package.id} ${version} (local, on this machine)`);
  execFileSync('node', [path.join(root, 'scripts', 'pack-tm.mjs'), app, version], { stdio: 'inherit' });
  const nupkg = path.join(root, 'dist', 'tm', `${tm.package.id}.${version}.nupkg`);
  via('Upload the package to the Orchestrator feed', ['or', 'packages', 'upload', nupkg]);
  const want = expectedTests(), deadline = Date.now() + tm.demo.ingestionTimeoutSeconds * 1000;
  step(`Wait until Test Manager has created ${want} test cases from the package (asking every 5 seconds)`);
  let created = [];
  while (Date.now() < deadline) {
    created = listCases().filter(c => !before.has(c.TestCaseKey));
    console.log(`   ${created.length} of ${want} test cases there`);
    if (created.length >= want) break;
    await sleep(5000);
  }
  if (created.length < want) { console.error(`only ${created.length} of ${want} test cases appeared in ${P} - check the package in Test Manager`); process.exit(1); }
  via(`Add the ${created.length} new test cases to test set ${setKey}`, ['tm', 'testcases', 'add', '--test-set-key', setKey, '--test-case-keys', ...created.map(c => c.TestCaseKey)]);
  step('Done');
  out({ package: `${tm.package.id} ${version}`, testCasesCreated: created.map(c => `${c.TestCaseKey}  ${c.Name}`), testSet: `${setKey}  ${setName}${setCreated ? ' (created)' : ''}` });
} else if (cmd === 'run') {
  const set = findSet();
  if (!set) { console.error(`test set "${setName}" does not exist in ${P} - run publish first`); process.exit(1); }
  const setKey = set.TestSetKey;
  console.log('This script runs no tests itself - it only tells Test Manager what to do, through the uip CLI.');
  const run = via(`Ask Test Manager to run test set ${setKey} "${setName}" on the serverless robot`, ['tm', 'testsets', 'run', '--test-set-key', setKey, '--execution-type', 'automated']);
  console.log(`   Test Manager started execution ${run.ExecutionId}`);
  via('Wait while the robot runs the tests in UiPath\'s cloud', ['tm', 'wait', '--execution-id', run.ExecutionId, '--project-key', P, '--timeout', String(tm.demo.runTimeoutSeconds)]);
  const s = via('Ask Test Manager for the result', ['tm', 'executions', 'get-stats', '--execution-id', run.ExecutionId, '--project-key', P]);
  // Proof that the tests did not run here: Test Manager names the robot and machine per test.
  const logs = via('Ask Test Manager who ran each test', ['tm', 'executions', 'testcaselogs', 'list', '--execution-id', run.ExecutionId, '--project-key', P]);
  console.log(`   this machine: ${os.hostname()}`);
  for (const l of logs) console.log(`   ${l.TestCase.ObjKey}  ${l.Result}  robot ${l.RobotName}, machine ${l.HostMachineName}, ${l.RuntimeType}, ${l.ExecutionStart} - ${l.ExecutionEnd}`);
  step('Result from Test Manager');
  out({ testSet: `${setKey}  ${setName}`, execution: run.ExecutionId, name: s.Name, status: s.Status, passed: s.Passed, failed: s.Failed, notRun: s.None, durationSeconds: Math.round((s.Duration || 0) / 1000) });
} else {
  console.error('usage: node scripts/tm-report.mjs plan | publish | run'); process.exit(2);
}
