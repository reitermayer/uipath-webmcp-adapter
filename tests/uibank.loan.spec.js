// UiBank loan decision - boundary tests generated from the manifest rules.
// Cases: tests/cases/uibank.loanDecision.cases.json (node scripts/generate-cases.mjs uibank)
// Every test drives the app only through the WebMCP tool - via the browser's own
// WebMCP API (document.modelContext), never through selectors.

import { test, expect } from '@playwright/test';
import { loadManifest, loadCases, injectAdapter, callWebMCP } from './support/webmcp.js';

const manifest = loadManifest('uibank');
const suite = loadCases('uibank.loanDecision.cases.json');

// One case -> [title, options, body] for test(). Every case is used exactly once.
const used = new Set();
function loanCase(id) {
  const c = suite.cases.find(x => x.id === id);
  if (!c) throw new Error(`Case ${id} not in ${suite.ruleSet} cases - run npm run cases`);
  used.add(id);
  return [c.title, { tag: c.tags }, async ({ page }, testInfo) => {
    const args = { ...suite.fixedInputs, ...c.inputs, confirm: true };
    const job = await callWebMCP(page, manifest, suite.tool, args);

    await testInfo.attach('webmcp-job.json', { body: JSON.stringify(job, null, 2), contentType: 'application/json' });
    testInfo.annotations.push(
      { type: 'rules', description: c.rules.join(', ') },
      { type: 'adapter', description: `${job.adapter} / manifest ${job.manifest?.version} / ${job.channel}` }
    );

    // Adapter problems (selectors, timeouts) fail here - separate from app behaviour below.
    expect(job.error, 'adapter error').toBeNull();
    expect(job.status).toBe('done');
    expect(job.evidence?.textSeen, 'result page text').toBe(true);
    expect(job.audit?.clean, 'form changed only by the WebMCP tool').toBe(true);

    // App behaviour against the documented rule.
    expect(job.result.outcome).toBe(c.expected.outcome);
    if (c.expected.outcome === 'approved') {
      expect(job.result.loanId).toMatch(/^[0-9a-f]{24}$/);
      expect(job.result.rate).toBeGreaterThan(0);
    } else {
      expect(job.result.loanId).toBeNull();
    }
  }];
}

test.describe(suite.suite, () => {
  test.beforeEach(async ({ context, page }) => {
    await injectAdapter(context, manifest);
    await page.goto(manifest.baseUrl);
  });

  // Demo: keep the result on screen for a moment (npm run test:visible)
  test.afterEach(async ({ page }) => {
    if (process.env.PW_DEMO_PAUSE) await page.waitForTimeout(Number(process.env.PW_DEMO_PAUSE));
  });

  // One line per case, no loop: Test Manager selects a test by file:line
  // (playwright test <file>:<line>), so a loop would run every case on that line.
  // The block is rewritten by scripts/generate-cases.mjs - do not edit by hand.
  // <generated-cases file="uibank.loanDecision.cases.json">
  test(...loanCase('loanDecision-smoke-1'));
  test(...loanCase('loanDecision-1'));
  test(...loanCase('loanDecision-2'));
  test(...loanCase('loanDecision-3'));
  test(...loanCase('loanDecision-4'));
  // </generated-cases>
});

if (used.size !== suite.cases.length) {
  throw new Error(`Spec covers ${used.size} of ${suite.cases.length} cases - run npm run cases`);
}
