---
name: discover
description: Discover a web form for the WebMCP adapter - scan its fields and selectors, find and probe its business rules with test data, and write discovery/ files plus manifests/<app>.manifest.json. Use when the user runs /discover with a URL or asks to discover, scan or onboard a new web app or form.
argument-hint: <form URL>
---

# Discover stage

Stage 1 of the adapter pipeline and the only one that needs AI. You explore a web form in a real browser and write the app knowledge that every later stage uses. Stages 2-5 (generate, inject, execute, report) are scripts - they only read what you write here.

Form to discover: $ARGUMENTS

## Before you start

1. You need a real browser: Claude in Chrome (`@browser` / `/chrome`) or Playwright MCP. If none is connected, stop and say so.
2. Start clean: run `npm run discover:reset`. It moves any earlier results from `discovery/` and `manifests/` into `backup/runs/<date_time>-discover/` - nothing is deleted. Tell the user in one sentence what was set aside, or that the folders were already empty.
3. App name: propose one from the domain (first part of the host, e.g. `uibank.uipath.com` -> `uibank`), lower case, no spaces. Ask the user once to confirm it.
4. Form name: a short slug for this form, e.g. `loan-apply`. Files below use `<app>-<form>`.
5. Do not read anything in `backup/` before your manifest is written. Every selector, label, rule and outcome must come from the live page and your probes. The format is in `manifest-format.md` next to this file.

## Step 1 - Scan

Open the URL. If it is not reachable directly, start at the app's entry page and record how you got there.

Record:
- page URL and title, whether a login is needed
- the form container selector
- every field: id, selector (prefer `#id`), control (`input` / `select` / `textarea` / radio / checkbox), type, visible label, placeholder, `required`, options for selects
- the submit button: selector and text
- the frontend framework and how input must be set (e.g. Angular: `_ngcontent-*`, `ng-pristine` classes -> native value setter plus `input`, `change`, `blur` events)
- anything odd (labels not linked, no min/max attributes)

Write `discovery/<app>-<form>.raw.json`.

## Step 2 - Find the rules

Look for business rules wherever the app reveals them: text on the page, help texts, validation messages, and the text on result or error pages after a submit. Note where each rule comes from. Do not invent rules.

## Step 3 - Probe

Design your own probes - nobody gives you the values.

- One baseline probe: submit the empty form. Record what blocks it and what changes.
- One typical "happy path" probe.
- For every numeric threshold you found: one probe just below and one just at or above it, keeping all other inputs fixed at typical values.
- A probe just outside the documented range (e.g. above the highest stated age). If the outcome is not explained by a stated rule, record it as a gap - never turn it into a rule.
- Watch the URL, the visible result text and, if visible, the backend request after each submit. These become the signals.

Test data only:
- email `webmcp.test@example.com`, names like `WebMCP Test`, round numbers
- never real personal data, never real credentials
- stop and ask before submitting anything that pays, orders, sends a message to people or cannot be undone
- keep it small - typically 5 to 10 submissions

Write `discovery/<app>-<form>.probes.json`: fixed inputs, each probe with input, expected (from the stated rule, if any) and actual outcome, the signals seen, and open questions.

## Step 4 - Write the manifest

Write `manifests/<app>.manifest.json` in the format of `manifest-format.md`:

- `pages`, `forms`, `signals` from steps 1 and 3
- one write tool `<app>.<verb><Object>` (e.g. `uibank.applyForLoan`) with `confirm: true`, an input schema and the steps `fill` -> `click` -> `waitFor` signals
- one read tool for the result page, if there is one
- `businessRules`: only rules that a probe confirmed, in the `when` / `outcome` form; probe results under `observed`, unexplained outcomes and untested areas under `openQuestions`
- `generatedBy`: `discovery (<agent> via <browser tool>)`, `generatedAt`: now as `DD.MM.YYYY HH:MM`


## Step 5 - Check

Run `node .claude/skills/discover/check-manifest.mjs <app>`. It is read-only. Fix every error it reports and run it again. Warnings may stay but go into your report.

Do not run `npm run cases` here - it rewrites the test files; that is the Generate stage.

## Step 6 - Report

Three short lines:
1. What you found: fields, rules confirmed, tools written.
2. Gaps and open questions.
3. Next step: `/generate` (stage 2 - turns the rules into test cases, no AI).

If an earlier manifest for this app exists - the newest one in `backup/runs/*-discover/manifests/`, else `backup/manifests/` - add one line comparing yours with it. Only now, after yours is written.

Write "-" instead of em dashes.
