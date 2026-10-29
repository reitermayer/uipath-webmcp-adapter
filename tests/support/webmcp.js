// Playwright side of the WebMCP bridge: inject runtime + manifest, then
// fire-and-poll a tool. Shared by the specs and scripts/run-tool.mjs.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function loadManifest(app) {
  return JSON.parse(readFileSync(path.join(root, 'manifests', `${app}.manifest.json`), 'utf8'));
}

export function loadCases(file) {
  return JSON.parse(readFileSync(path.join(root, 'tests', 'cases', file), 'utf8'));
}

// addInitScript re-injects both on every navigation and frame.
export async function injectAdapter(context, manifest) {
  await context.addInitScript({ path: path.join(root, 'runtime', 'webmcp-runtime.js') });
  await context.addInitScript({ content: `window.__webmcp && window.__webmcp.register(${JSON.stringify(manifest)});` });
}

// evaluate() fails while a navigation replaces the page - wait and retry.
async function bridge(page, fn, arg) {
  for (let i = 0; i < 50; i++) {
    try {
      await page.waitForFunction(() => !!window.__webmcp, null, { timeout: 5000 });
      return JSON.parse(await page.evaluate(fn, arg));
    } catch (e) {
      if (!/context was destroyed|navigat|Target closed|Timeout/i.test(String(e))) throw e;
      await page.waitForTimeout(200);
    }
  }
  throw new Error('page never settled');
}

export function listTools(page) {
  return bridge(page, () => window.__webmcp.list());
}

export async function runTool(page, tool, args, { timeoutMs = 60000 } = {}) {
  const started = await bridge(page, ([t, a]) => window.__webmcp.start(t, a), [tool, args]);
  let job = started;
  const deadline = Date.now() + timeoutMs;
  while (job.status === 'running' && Date.now() < deadline) {
    await page.waitForTimeout(250);
    job = await bridge(page, id => window.__webmcp.poll(id), started.id);
  }
  return job;
}

// Call a tool through the browser's own WebMCP API (document.modelContext),
// the way an agent in the browser would. Opens the tool's page first, because
// a full page load during the call would cut the native call off; for such
// tools use runTool (fire-and-poll via sessionStorage) instead.
export async function callWebMCP(page, manifest, name, args) {
  const tool = manifest.tools[name];
  const target = tool.page && manifest.pages[tool.page];
  if (target && !new RegExp(target.match).test(new URL(page.url()).pathname)) {
    await page.goto(new URL(target.path, manifest.baseUrl).href);
  }
  const nativeName = name.replace(/[^A-Za-z0-9_-]/g, '_');
  await page.waitForFunction(n => document.modelContext &&
    document.modelContext.getTools().then(ts => ts.some(t => t.name === n)), nativeName, { timeout: 10000 });
  const raw = await page.evaluate(async ([n, a]) => {
    const t = (await document.modelContext.getTools()).find(x => x.name === n);
    // Chrome 155+ takes the arguments as an object, Chrome 154 as a JSON string.
    // getTools() tells the versions apart: 154 returns inputSchema as a string.
    // The other form is the fallback - a rejected input never reaches the tool,
    // so the second attempt is safe. The rejection is a TypeError in Chrome 155
    // and an UnknownError ("Failed to parse input arguments") in older builds.
    const forms = typeof t.inputSchema === 'string' ? [JSON.stringify(a), a] : [a, JSON.stringify(a)];
    try {
      return await document.modelContext.executeTool(t, forms[0]);
    } catch (e) {
      if (!(e instanceof TypeError) && !/input/i.test(String(e && e.message))) throw e;
      return document.modelContext.executeTool(t, forms[1]);
    }
  }, [nativeName, args]);
  const res = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return { ...JSON.parse(res.content[0].text), channel: 'webmcp-native', isError: !!res.isError };
}
