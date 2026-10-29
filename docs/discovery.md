# Discovery Phase & Manifest Generation

How unfamiliar third-party web applications are explored, probed, and converted into declarative WebMCP manifests.

---

## Overview

The Discovery Phase is an exploratory stage where an AI agent inspects a target web application that lacks structured API endpoints or native WebMCP support. 

Rather than manually scraping selectors or building hard-coded UI automation repositories, an AI agent explores the application, extracts form structures and framework traits, executes synthetic probes, and synthesizes the findings into a declarative manifest ([manifests/uibank.manifest.json](../manifests/uibank.manifest.json)).

```
+-------------------------------------------------------+
|  AI Agent Exploratory Discovery                       |
|  - Reads target web app URLs and DOM tree             |
|  - Identifies forms, controls, IDs, submit triggers   |
|  - Detects framework traits (Angular, React, Vue)     |
+---------------------------+---------------------------+
                            |
           discovery/uibank-loan-apply.raw.json
                            |
+---------------------------v---------------------------+
|  Outcome Probing with Synthetic Test Data             |
|  - Submits exploratory probe payloads                 |
|  - Tests boundary conditions (e.g., age 17 vs 18)     |
|  - Identifies signals, error states, and rule gaps    |
+---------------------------+---------------------------+
                            |
           discovery/uibank-loan-probes.json
                            |
+---------------------------v---------------------------+
|  Manifest Synthesis                                   |
|  - Compiles routes, selectors, tools, and rules       |
|  - Generates manifests/uibank.manifest.json           |
|  - Replaces traditional UiPath Object Repositories    |
+---------------------------+---------------------------+
                            |
    Ready for deterministic test generation (Phase 2)
```

---

## 1. DOM Scanning

The agent navigates to the application entry point (e.g., `https://uibank.uipath.com/welcome`) and follows user journeys to the target forms:

- **Form Structure Identification**: Locates form containers (`form.form-container`), inputs, select dropdowns, radio buttons, and submission buttons (`#submitButton`).
- **Control Metadata Extraction**: Captures element IDs, tag types, visible labels, placeholders, and required attributes.
- **Framework Fingerprinting**: Detects frontend framework traits that influence how input events must be dispatched:
  - Angular markers: `_ngcontent-*` attributes, `ngModel` bindings, and reactive status classes (`ng-untouched`, `ng-pristine`, `ng-invalid`).
  - Single-page application routing mechanisms.
- **Raw Scan Recording**: Raw metadata is saved to [discovery/uibank-loan-apply.raw.json](../discovery/uibank-loan-apply.raw.json).

---

## 2. Outcome Probing with Synthetic Test Data

### What are Probes?
**Probes are synthetic test data sets** (exploratory sample payloads) designed to test backend validation rules, response behaviors, and route outcomes before any formal test suites are authored.

During discovery, documentation may be incomplete or out of date. Rather than guessing application behavior, the agent executes controlled probe requests ([discovery/uibank-loan-probes.json](../discovery/uibank-loan-probes.json)) against documented business rules:

- **Baseline Probe (Validation Block)**:
  - Input: Submitting an empty form.
  - Observed Outcome: Browser client validation blocks on required fields (e.g., `#term`), form updates to `ng-submitted`, remaining on the application page without network postback.
- **Boundary Probes (Threshold Verification)**:
  - Age threshold: Submitting age `17` vs `18` to verify adult age requirements (verifying transition from denial to approval).
  - Amount threshold: Submitting amount `100000` vs `100001` with fixed income and term to confirm loan limits.
- **Discovering Undocumented Behavior (Rule Gaps)**:
  - Submitting probe data for senior applicants (age `66`) with amount `100001` revealed an undocumented denial outcome, surfacing an explicit business rule gap that is preserved in the manifest rather than guessed.

---

## 3. Manifest Synthesis

The agent combines DOM scan metadata and probe results into a single declarative application manifest:

- **Page Routes & Locators**: Maps logical page names to URL patterns and key selectors.
- **Form Schemas**: Lists field IDs, selectors, control types, and required fields.
- **Signals**: Declares success and error indicators (e.g., approval rates, denial messages, URL redirects) used by the runtime to determine when an operation completes.
- **Tool Definitions**: Exposes high-level tools (such as `applyForLoan`) with parameter schemas, default inputs, and multi-step action plans (`navigate` -> `fill` -> `click` -> `waitFor`).
- **Business Rules**: Formalizes the verified boundary thresholds and logic rules directly inside the manifest.

This declarative manifest replaces manual element scraping and hard-coded UiPath Object Repositories with a web-native, versioned JSON format ([manifests/uibank.manifest.json](../manifests/uibank.manifest.json)).

---

## 4. Transition to Deterministic Test Generation

Once the manifest is synthesized, AI exploration is complete. All downstream testing steps operate deterministically:
1. `npm run cases` ([scripts/generate-cases.mjs](../scripts/generate-cases.mjs)) reads `businessRules` from the manifest and automatically calculates boundary cases.
2. `npm run tm:sync` ([scripts/tm-sync.mjs](../scripts/tm-sync.mjs)) synchronizes test cases into UiPath Test Manager.
3. Automated test runs execute reliably without further AI intervention.
