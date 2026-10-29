// Playwright reporter: report a local run into UiPath Test Manager.
//
// Enabled with TM_REPORT=1 (see playwright.config.js). Needs `uip login`.
// Mapping test title -> Test Manager test case comes from tests/cases/*.tm.json
// (written by scripts/tm-sync.mjs).
//
// One Playwright run = one Test Manager execution:
//   - whole test set ran      -> uip tm testsets run  (execution on the fixed test set)
//   - only some tests ran     -> uip tm testcases run (execution for exactly those cases)
//   - TM_EXECUTION_ID is set  -> fill that existing execution (e.g. started in the TM UI)
// Then per test: testcaselog start/finish with Passed/Failed, plus attachments
// (screenshot, trace, WebMCP job record, error text).

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { root } from './webmcp.js';
import { uip } from './uip.js';

function loadMaps() {
  const dir = path.join(root, 'tests', 'cases');
  return readdirSync(dir).filter(f => f.endsWith('.tm.json'))
    .map(f => JSON.parse(readFileSync(path.join(dir, f), 'utf8')));
}

export default class TestManagerReporter {
  constructor() {
    this.results = new Map(); // test id -> { test, result } (last retry wins)
  }

  onTestEnd(test, result) {
    this.results.set(test.id, { test, result });
  }

  async onEnd() {
    const maps = loadMaps();
    for (const map of maps) {
      const ran = [...this.results.values()].filter(r =>
        r.test.parent?.title === map.suite && map.testCases[r.test.title]);
      if (!ran.length) continue;
      try {
        this.report(map, ran);
      } catch (e) {
        console.error(`[tm-reporter] ${map.testSetKey}: ${e.message}`);
      }
    }
  }

  report(map, ran) {
    const project = map.projectKey;
    const executedBy = uip(['login', 'status']).UserEmail;
    const ids = ran.map(r => map.testCases[r.test.title].id);

    let executionId = process.env.TM_EXECUTION_ID;
    if (!executionId) {
      const whole = Object.keys(map.testCases).every(t => ran.some(r => r.test.title === t));
      executionId = whole
        ? uip(['tm', 'testsets', 'run', '--test-set-key', map.testSetKey, '--execution-type', 'manual']).ExecutionId
        : uip(['tm', 'testcases', 'run', '--project-key', project, '--execution-type', 'manual',
            '--name', `${map.suite} (Playwright subset)`, '--test-case-id', ...ids]).Id;
    }

    const logs = new Map(uip(['tm', 'executions', 'testcaselogs', 'list', '--execution-id', executionId, '--project-key', project])
      .map(l => [l.TestCaseId, l.Id]));

    const outDir = path.join(root, 'test-results', 'tm-reporter');
    mkdirSync(outDir, { recursive: true });

    let passed = 0, failed = 0;
    for (const { test, result } of ran) {
      const tc = map.testCases[test.title];
      const ok = result.status === 'passed';
      ok ? passed++ : failed++;
      const base = ['--project-key', project, '--execution-id', executionId, '--test-case-id', tc.id];
      uip(['tm', 'testcaselog', 'start', ...base]);
      const log = uip(['tm', 'testcaselog', 'finish', ...base,
        '--result', ok ? 'Passed' : 'Failed', '--has-error', String(!ok && result.status !== 'failed'),
        '--executed-by', executedBy]);
      const logId = log.Id || logs.get(tc.id);

      const files = [];
      for (const a of result.attachments) {
        if (a.path) files.push(a.path);
        else if (a.body) {
          const f = path.join(outDir, `${tc.key.replace(':', '-')}-${a.name}`);
          writeFileSync(f, a.body);
          files.push(f);
        }
      }
      if (!ok) {
        const f = path.join(outDir, `${tc.key.replace(':', '-')}-error.txt`);
        writeFileSync(f, result.errors.map(e => e.message || e.value || '').join('\n\n').replace(/\u001b\[[0-9;]*m/g, ''));
        files.push(f);
      }
      for (const file of files) {
        try {
          uip(['tm', 'attachment', 'upload', '--project-key', project, '--object-type', 'testCaseLog', '--object-id', logId, '--file', file]);
        } catch (e) {
          console.error(`[tm-reporter] ${tc.key}: attachment ${path.basename(file)} failed: ${e.message}`);
        }
      }
      console.log(`[tm-reporter] ${tc.key} ${ok ? 'Passed' : 'Failed'} (${files.length} attachments)`);
    }
    console.log(`[tm-reporter] execution ${executionId} in ${project}: ${passed} passed, ${failed} failed`);
  }
}
