// Run one WebMCP tool against its app in Playwright's Chromium.
//
//   node scripts/run-tool.mjs <app> <tool> '<json args>' [--headed] [--list]
//   node scripts/run-tool.mjs uibank uibank.applyForLoan '{"email":"a@b.co","amount":5000,"term":"5","income":60000,"age":30,"confirm":true}' --headed
//
// Injection is the primary path from CLAUDE.md: addInitScript for the runtime
// plus the manifest, so both are re-injected on every navigation.

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { root, loadManifest, injectAdapter, listTools, runTool } from '../tests/support/webmcp.js';

const argv = process.argv.slice(2);
const flags = new Set(argv.filter(a => a.startsWith('--')));
const [app, tool, argsJson = '{}'] = argv.filter(a => !a.startsWith('--'));

if (!app) {
  console.error('usage: node scripts/run-tool.mjs <app> <tool> \'<json args>\' [--headed] [--list]');
  process.exit(2);
}

const manifest = loadManifest(app);
const headed = flags.has('--headed');

const browser = await chromium.launch({ headless: !headed, slowMo: headed ? 150 : 0, args: ['--enable-features=WebMCPTesting'] });
const context = await browser.newContext();
await injectAdapter(context, manifest);
const page = await context.newPage();

let out;
try {
  await page.goto(manifest.baseUrl);
  if (flags.has('--list') || !tool) {
    out = await listTools(page);
  } else {
    out = await runTool(page, tool, JSON.parse(argsJson));
    mkdirSync(path.join(root, 'test-results'), { recursive: true });
    const shot = path.join(root, 'test-results', `${tool}-${out.id || 'error'}.png`);
    await page.screenshot({ path: shot });
    out.screenshot = path.relative(root, shot);
    if (headed) await page.waitForTimeout(3000);
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify(out, null, 2));
process.exit(out.status === 'error' ? 1 : 0);
