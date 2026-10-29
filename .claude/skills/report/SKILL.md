---
name: report
description: Stage 5 of the WebMCP adapter pipeline - run the generated tests in UiPath Test Manager on a serverless robot. Packs and uploads the tests, lets Test Manager create the test cases, runs the test set and reports the result. Use when the user runs /report.
disable-model-invocation: true
allowed-tools: Bash(node scripts/tm-report.mjs plan), Bash(node scripts/tm-report.mjs publish), Bash(node scripts/tm-report.mjs run), Bash(uip login status:*), Read
---

# Report stage

Stage 5 of the adapter pipeline - no AI involved. The same tests that ran locally with `/inject-execute` now run in UiPath Test Manager, on a serverless robot in UiPath's cloud. Results, screenshots, traces and the WebMCP job records are stored there.

All settings (tenant, project, test set, package) come from `testmanager.json`. You only run `scripts/tm-report.mjs` and explain the result in plain words. Do not call `uip` directly except `uip login status`, and do not change any settings.

## Steps

1. **Check the login:** run `uip login status`. If it is not logged in or expired, tell the user to run `uip login` in the terminal, and stop.
2. **Plan:** run `node scripts/tm-report.mjs plan`. Show the user, briefly: tenant, project, test set (existing, or "will be created"), the next package version and how many tests the package holds.
3. **Old test cases:** you never delete anything in Test Manager - the user deletes old test cases and test sets by hand before a demo. If the plan lists existing test cases, name how many there are and ask: "There are still <n> test cases in <project> - continue anyway, or delete them in Test Manager first?" Wait for the answer. If there are none, go on.
4. **Publish:** run `node scripts/tm-report.mjs publish`. It creates the test set if it is missing (found by its name from `testmanager.json`), packs the tests, uploads the package, waits until Test Manager has created one test case per test, and adds them to the test set. Tell the user: package version, the new test case keys and names, and the test set (say so if it was newly created).
5. **Run:** run `node scripts/tm-report.mjs run`. It starts a new execution of the test set on the serverless robot and waits until it is finished (usually under a minute). Report: "<passed> of <total> passed in <n> seconds", the execution name, and that screenshots, traces and job records are in Test Manager under Test Executions.

If a step fails, show its message in plain words and stop - do not retry or clean up by hand. Common causes: expired `uip` login; the robot account is not a member of the Test Manager project (results then fail to upload).

Keep the whole answer short. Write "-" instead of em dashes.
