# Repository Structure

An overview of all major folders across the repository. Back to the [README](../README.md).

| Directory | Purpose |
|---|---|
| [discovery/](../discovery) | Raw DOM scans, form field dumps, and outcome probe logs captured by AI agents during exploratory discovery. |
| [runtime/](../runtime) | The WebMCP runtime engine ([webmcp-runtime.js](../runtime/webmcp-runtime.js)). Page-agnostic; driven entirely by declarative manifests. |
| [manifests/](../manifests) | Declarative JSON manifests ([uibank.manifest.json](../manifests/uibank.manifest.json)) detailing URL routes, DOM selectors, framework wait parameters, tool schemas, and business rules. |
| [tests/](../tests) | Playwright test suites ([uibank.loan.spec.js](../tests/uibank.loan.spec.js)), test cases, and bridge support utilities. |
| [tests/cases/](../tests/cases) | Deterministic test case data generated from business rules (`*.cases.json`) and UiPath Test Manager entity mappings (`*.tm.json`). |
| [tests/support/](../tests/support) | Bridge helpers ([webmcp.js](../tests/support/webmcp.js)), UiPath CLI wrapper ([uip.js](../tests/support/uip.js)), and Test Manager custom reporter ([tm-reporter.js](../tests/support/tm-reporter.js)). |
| [scripts/](../scripts) | Node.js automation scripts for test generation, packaging, syncing with Test Manager, standalone bundling, and direct tool execution. |
| [docs/](../docs) | Architecture deep dives ([docs/discovery.md](discovery.md), [docs/form-filling-internals.md](form-filling-internals.md)) and visual evidence ([docs/webmcp-evidence.md](webmcp-evidence.md)). |
| `uipath/` | Planned (empty): integration point for UiPath `Inject Js Script` activities and standalone cross-platform snippets. |
| `dist/` | Build artifacts (not in Git, created by the scripts): bundled injection scripts (`dist/webmcp-<app>.js`) and packaged Test Manager NuGet archives (`dist/tm/`). |
| `archive/` | Planned (empty): historical proof-of-concept scripts and deprecated single-file experiments. |
