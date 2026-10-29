---
name: generate
description: Stage 2 of the WebMCP adapter pipeline - turn the business rules in manifests/<app>.manifest.json into boundary test cases with a script, no AI. Use when the user runs /generate or asks to generate the test cases from the manifest.
argument-hint: [app]
disable-model-invocation: true
allowed-tools: Bash(npm run cases:reset), Bash(node scripts/generate-cases.mjs:*), Read
---

# Generate stage

Stage 2 of the adapter pipeline. A script reads the business rules that `/discover` wrote into the manifest and calculates the test cases: for every threshold it takes the value just below and at the limit, combines them, and derives the expected outcome from the rules. Combinations no rule covers are listed as gaps - never guessed.

You only run the scripts and explain the result. Do not write or edit test cases yourself - the point of this stage is that it involves no AI: same manifest, same tests, every time.

App: $ARGUMENTS

## Steps

1. Find the app: use the argument if given; otherwise the one file in `manifests/` (`manifests/<app>.manifest.json`). If there is none, say that `/discover` has to run first and stop. If there are several, ask which one.
2. Start clean: run `npm run cases:reset`. It moves earlier test cases from `tests/cases/` into `backup/runs/<date_time>-generate/` and empties the generated test lines in the specs. Test Manager key files (`*.tm.json`) stay. Nothing is deleted.
3. Generate: run `node scripts/generate-cases.mjs <app>`.
4. Read the new `tests/cases/<app>.<ruleSet>.cases.json` and report in plain words, without technical details:
   - "<n> test cases from <m> rules, <g> gaps" - one line per rule set
   - the test cases as a short list, using each case's `title` (for example "age 17, amount 100000 is denied [R1]")
   - any gaps, in plain words, as open points for the business
   - where the cases went: `tests/cases/` and one `test()` line each in the spec
5. Next step, one line: the tests can now run - locally, or in UiPath Test Manager.

If a command fails, show its message and stop - do not fix files by hand.

Keep the whole answer short. Write "-" instead of em dashes.
