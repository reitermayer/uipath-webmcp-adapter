---
name: inject-execute
description: Stages 3 and 4 of the WebMCP adapter pipeline - run the generated tests in a visible Chrome. Playwright injects the adapter (runtime + manifest) into every page, and each test calls the WebMCP tool, which fills and submits the form. Use when the user runs /inject-execute or /run-tests, or asks to run the tests.
argument-hint: [headless]
disable-model-invocation: true
allowed-tools: Bash(npm run test:visible), Bash(npm test), Bash(npm run report), Read, Glob
---

# Inject and execute

Stages 3 and 4 of the adapter pipeline, run together - no AI involved:

- **Inject (3):** Playwright opens Chrome and adds the generic runtime and `manifests/<app>.manifest.json` to every page before it loads. The app itself knows nothing about WebMCP - after injection it offers the manifest's tools (e.g. `uibank.applyForLoan`).
- **Execute (4):** every generated test calls the tool with its values. The runtime fills the form (each field flashes orange, then a green banner), submits it and returns a job record. The test checks two things: first adapter health (no error, result text seen, audit clean - only the tool touched the form), then the business outcome against the expected one.

You only start the run and explain the result. Do not edit tests, cases or the manifest, and do not retry failed tests on your own.

Mode: $ARGUMENTS

## Steps

1. Check that test cases exist: `tests/cases/*.cases.json`. If there are none, say that `/generate` has to run first and stop.
2. Tell the user in one sentence what is about to happen: "Chrome opens and runs <n> test cases one by one - watch the form fill itself."
3. Run the tests:
   - default: `npm run test:visible` - visible Chrome, one test after the other, a short pause on each result
   - if the argument is `headless`: `npm test`
4. Report in plain words, without technical details:
   - "<passed> of <total> passed" and how long it took
   - for every failed test: its title, and whether the **adapter** failed (error, result text not seen, audit not clean - the tool could not do its job) or the **app** behaved differently than the rule says (outcome differs from expected). Say which, in one sentence each.
5. Show the result in the chat:
   - a table with one row per test: number, test case, rule, outcome (approved/denied), result (passed/failed + duration) and a link to its screenshot `test-results/<test folder>/test-finished-1.png` (find the folders with Glob)
   - below the table, two screenshots inline as markdown images (`![title](relative path)`): one approved and one denied case. If a test failed, show the failed ones instead.
6. Open the full report in Chrome: run `npm run report` in the background (it keeps running, so do not wait for it). It starts the local report server, opens the report in Google Chrome and stops the server by itself after 10 minutes. Say in one line that the report is open in Chrome, with screenshot, trace and the WebMCP job record per test, and that it stays available for 10 minutes.
7. Next step, one line: the same tests can run in UiPath Test Manager on a serverless robot, with results, screenshots and traces stored there.

If Chrome does not start or WebMCP is missing (`document.modelContext` not found), say that the WebMCP flag must be enabled in Chrome (chrome://flags/#enable-webmcp-testing) and stop.

Keep the whole answer short. Write "-" instead of em dashes.
