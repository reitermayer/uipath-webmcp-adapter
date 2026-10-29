---
name: devtools-demo
description: Prepare the WebMCP DevTools demo in the user's own Chrome - rebuild the injection bundle (runtime + current manifest) and copy it to the clipboard, ready to paste into a DevTools snippet on the app page. Use when the user runs /devtools-demo.
argument-hint: [app]
disable-model-invocation: true
allowed-tools: Bash(node scripts/build-inject.mjs:*), Bash(pbcopy < dist/webmcp-*.js), Read, Glob
---

# DevTools demo

Shows WebMCP in the user's own Chrome, without Playwright: the bundle (generic runtime + the app's manifest) is run once in the page, and Chrome's own DevTools panel lists the tools and runs them. No AI involved.

App: $ARGUMENTS (default: the one file in `manifests/`)

## Steps

1. Find the app: the argument, or the one `manifests/<app>.manifest.json`. If there is none, say that `/discover` has to run first and stop.
2. Build: `node scripts/build-inject.mjs <app>` - writes `dist/webmcp-<app>.js` with the current manifest.
3. Copy: `pbcopy < dist/webmcp-<app>.js`.
4. Tell the user, as a short numbered list:
   1. Chrome needs `chrome://flags/#enable-webmcp-testing` and `#devtools-webmcp-support` enabled (relaunch after changing).
   2. Open the app's form page (from the manifest: `baseUrl` + the tool's page path, for UiBank https://uibank.uipath.com/loans/apply).
   3. DevTools (Cmd+Option+I) - Sources - Snippets - New snippet `webmcp-<app>` - paste (Cmd+V) - run (Cmd+Enter). The page shows the adapter's tools panel. An existing snippet: select all, paste over it, run.
   4. DevTools - Application - WebMCP: the tools are listed; pick `<app>_applyForLoan` (or the write tool), fill the form DevTools builds from the schema (confirm: true), click Run Tool, watch the page and Tool Activity.
   5. After a full page reload the tools are gone - run the snippet again.

Keep it short. Write "-" instead of em dashes.
