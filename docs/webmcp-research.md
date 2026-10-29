# WebMCP - how web apps get tools for AI agents

Status: 02.10.2026 · Johannes Reitermayer

## 0. About this paper

AI agents are starting to use web applications the way people do - and WebMCP is the proposed web standard that lets them do it properly. This paper collects what you need to know about it in one place: where it comes from, how it works, who backs it, how likely it is to last, and what it means for testing. Read it front to back, or jump to the chapter you need.

Each chapter opens with three lines: the idea in one picture, the value it adds, and what to watch out for. The details and a one-line key point follow.

**The chapters at a glance**

| # | Chapter | Key point |
|---|---|---|
| 1 | MCP in 60 seconds | AI agents act through tools, and MCP is the standard plug for tools. |
| 2 | How test automation drives web apps today | UI tests break because they find things by appearance, not by purpose. |
| 3 | What WebMCP is | A web page hands its tools directly to the agent in the browser. |
| 4 | How it works technically | A tool is a name, a description, an input schema and a function, registered at `document.modelContext`. |
| 5 | Who is behind it and how mature it is | Google and Microsoft drive it, and it runs as a trial in Chrome and Edge today. |
| 6 | Will WebMCP stick? | Very likely in Chromium browsers, open as a cross-browser standard - and the approach pays off either way. |
| 7 | The catch and our twist | Vendors won't ship tools for us, so we inject them ourselves. |
| 8 | Trust and security | The tool runs with the user's session, so we limit what it can do and audit what it did. |

**How claims are marked:**

- **[source]** - checked against a primary source (spec, browser vendor, standards body), linked in [Sources](#10-sources)
- **[our test]** - verified in this project (Chrome 154, UiBank), see [webmcp-evidence.md](webmcp-evidence.md)
- **[reported]** - reported by secondary sources, not confirmed by a primary source

---

## 1. MCP in 60 seconds

> **What is MCP?** A universal remote. One remote works with every TV, as long as the TV speaks the same language. MCP is that language between an AI and the things it should operate.
>
> **Value added:** One integration standard instead of a custom integration per AI vendor and per system. Build once, use it from any agent.
>
> **Watch out:** Every MCP server is software that acts with your rights. Connect only servers you trust and review, the same way you would treat any other dependency.

- An AI model on its own can only produce text. To *do* something (read a ticket, start a test, book a loan), it needs **tools**.
- The **Model Context Protocol (MCP)** is an open standard for exactly that. Anthropic introduced it in November 2024. In December 2025 it was donated to the **Agentic AI Foundation** under the Linux Foundation, which was founded by Anthropic, OpenAI and Block and is supported by Google, Microsoft, AWS and others **[source]**.
- The roles:
  - **Host / agent** - the AI application (Claude, ChatGPT, a coding agent)
  - **MCP server** - a program that offers tools (for example a Jira or Test Manager connector)
- Every tool has three parts: a **name**, a **description** in plain language (so the AI knows when to use it) and an **input schema** (which parameters, which types, which are required).

```
Agent  --"which tools do you have?"-->  MCP server
Agent  <--- createTestCase(title, steps) ---
Agent  --- createTestCase("Loan > 18", ...) -->  MCP server  --> Test Manager
```

**Key point:** Agents act through tools, and MCP is the standard plug that connects tools to agents.

---

## 2. How test automation drives web apps today

> **Why do UI tests break?** You find your friend's front door by its blue paint. One day the door gets painted green, and you can't find it anymore - even though it is still the same door.
>
> **Value added:** Maintenance is the hidden cost of UI test automation. Tests fail after harmless UI changes, people spend time repairing tests instead of finding bugs, and trust in red results erodes.
>
> **Watch out:** AI agents that click through the UI are not the cure. They are slower, cost money per run and can take a different path each time, which makes results hard to reproduce.

Today a UI test (Selenium, Playwright, Cypress) or an AI agent has to work out on its own where to click:

| Approach | How it finds "the loan amount field" | Typical problem |
|---|---|---|
| Locators (CSS, XPath, ID) | `#amount`, `//form/div[3]/input` | Breaks when the layout or ID changes |
| Page objects | A class that wraps the locators | Someone has to write and maintain it per page |
| Role / text locators | `getByRole('textbox', { name: 'Amount' })` | More robust, but breaks on wording or language changes |
| AI agents on screenshots or DOM | Looks at the page and guesses | Slow (seconds per step), sometimes guesses wrong, hard to reproduce |

The result is **flaky tests**: tests that fail without a real bug. Modern frameworks (Angular, React) make it harder: setting a value is not enough, the framework also has to *notice* the change (see [form-filling-internals.md](form-filling-internals.md)).

Side note for RPA people: the UiPath Object Repository is the same idea as page objects, curated by hand in Studio.

**The root problem:** a test finds things by their **appearance** (position, ID, label). What it actually wants is the **purpose**: "apply for a loan of 50,000 for a 30-year-old".

**Key point:** UI tests break because they find things by appearance, not by purpose.

---

## 3. What WebMCP is

> **What is WebMCP?** In a restaurant you get a menu. You don't walk into the kitchen and point at pots. WebMCP is the menu of a web page: "here is what you can order here".
>
> **Value added:** The page states what it can do, so agents and tests stop guessing. That means faster, more reliable runs with clear results.
>
> **Watch out:** A tool can drift away from the UI it represents. If the tool says "done" but the page shows something else, a test that only trusts the tool misses the bug.

**WebMCP** (Web Model Context Protocol) is a proposed web standard. A web page publishes its own **tools** in the browser, and an AI agent calls them with structured inputs instead of clicking through the UI **[source]**.

Example from our UiBank demo:

```
uibank_applyForLoan({ email, amount: 50000, term: "5", income: 60000, age: 30, confirm: true })
  -> { outcome: "approved", rate: 6, loanId: "..." }
```

**MCP vs WebMCP:**

| | MCP | WebMCP |
|---|---|---|
| Where the tools live | In a separate MCP server (local or cloud) | In the web page, inside the browser tab |
| Who provides them | Whoever runs the server | The website (or, in our case, our injected runtime) |
| Login / session | The server needs its own authentication (API key, OAuth) | Uses the session the user already has in the browser |
| Who mediates | The MCP client in the agent | The browser |
| What the user sees | Nothing, it runs in the background | The page itself - the tool fills the real form, visible |
| Discovery | The agent connects to a known server | The agent asks the open tab which tools it has |

The session row is the reason WebMCP exists. Alex Nahas, then an engineer at Amazon, built a browser variant of MCP called **MCP-B** because many internal services did not support MCP's OAuth flow, while users were already logged in through the browser. MCP-B, a Microsoft proposal and Google's "script tools" work then merged into WebMCP **[reported]**.

**Key point:** With WebMCP, a web page hands its tools directly to the agent in the browser, using the user's existing session.

---

## 4. How it works technically

> **How does a tool call work?** The menu card lists the dishes. The browser is the waiter who takes your order to the kitchen and brings back the plate. You never touch the stove.
>
> **Value added:** The interface is small and standardized - a few functions. A tool is a stable contract that both a test and an AI agent can use.
>
> **Watch out:** More tools are not always better. Every tool an agent can see takes space in its context window, and two tools with the same name (say `create_test` from UiPath Test Manager and from Xray) make the agent guess. See [Many tools, one agent](#many-tools-one-agent).

### Two ways for a page to publish tools

**1. Imperative API (JavaScript)** **[source]**

```js
document.modelContext.registerTool({
  name: "uibank_applyForLoan",
  description: "Apply for a loan and return the decision",
  inputSchema: { type: "object", properties: { amount: { type: "number" }, age: { type: "number" } } },
  annotations: { consequentialHint: true },      // optional hints, e.g. readOnlyHint
  execute: async (args) => { /* fill the form, submit, return the result */ }
});
```

**2. Declarative API (HTML only)** **[source]**

```html
<form toolname="applyForLoan" tooldescription="Apply for a loan">
  <input name="amount" toolparamdescription="Loan amount in USD">
  ...
</form>
```

The browser turns the form into a tool with a schema. By default the agent pre-fills the form and the user still clicks submit. `toolautosubmit` allows automatic submission.

### How the agent (or a test) uses the tools

```js
const tools = await document.modelContext.getTools();          // what's on the menu?
const tool  = tools.find(t => t.name === "uibank_applyForLoan");
const raw   = await document.modelContext.executeTool(tool, JSON.stringify(args));  // order
```

- **Where:** `document.modelContext`. Earlier drafts used `navigator.modelContext`. The spec moved it to `document` in May 2026, and Chrome marks the `navigator` variant as deprecated **[source]**. Our runtime uses `document.modelContext` **[our test]**.
- **Developer view:** Chrome DevTools > Application > **WebMCP** lists the registered tools, can run them through a generated form and shows tool calls live **[our test]**, see [webmcp-evidence.md](webmcp-evidence.md).
- **Iframes:** tools from cross-origin iframes are protected by the `tools` permissions policy and have to be explicitly allowed **[source]**. This matters for apps that embed their forms in iframes.

### Many tools, one agent

An agent decides which tool to call by reading every tool's name and description. That has two side effects that grow with every connected MCP server and every page with tools:

- **Context window pollution:** all tool definitions are loaded into the agent's working memory (the context window) before it does anything. Dozens of servers with hundreds of tools cost tokens, money and attention - the agent gets slower and picks the right tool less reliably.
- **Name collisions:** if UiPath Test Manager and Xray are both connected and both offer a `create_test` tool, the agent has to guess from the descriptions which one is meant. A wrong guess creates the test in the wrong system.

What helps:

| Measure | Example |
|---|---|
| Prefix tool names with the app or system | `uibank_applyForLoan`, `testmanager_create_test`, `xray_create_test` - our runtime does this automatically |
| Connect only what the task needs | One test-management system per agent session, not all of them |
| Precise descriptions | "Creates a test case in UiPath Test Manager project WEBMCP" instead of "Creates a test" |
| Load tools on demand | Agent platforms increasingly support tool search, where tools are loaded only when needed |
| Page tools are scoped by design | WebMCP tools only exist while their page is open, so an agent sees UiBank's tools only on UiBank |

### The testing angle

A WebMCP tool is a **page object that the app ships itself**: a stable, typed interface with a contract (input schema) and a structured result. Tests call the tool and assert on the result, without any locators in the test (example: [README.md](../README.md)).

**Key point:** A tool is a name, a description, an input schema and a function, registered at `document.modelContext`. Tests and agents call it the same way.

---

## 5. Who is behind it and how mature it is

> **Who is behind it?** Bluetooth started as an agreement among a handful of big electronics companies. Once they were on board, every headphone, car and smartwatch followed. WebMCP starts the same way: two of the biggest browser makers agreed first.
>
> **Value added:** This is not a single-vendor bet. Google and Microsoft develop it together, and the browsers behind most desktop traffic are already testing it.
>
> **Watch out:** It is still a trial. Origin trials expire, and the API has already changed once (`navigator` -> `document`). Anything built on it today must expect breaking changes.

### Who

- **Google and Microsoft, together.** The spec editors are Brandon Walderman (Microsoft), Khushal Sagar (Google) and Dominic Farolino (Google) **[source]**. Microsoft's Edge team announced WebMCP on 28.08.2025 as "a joint effort between the Edge and Google teams" **[reported]**.
- **Where:** W3C Web Machine Learning **Community Group**. Status: "Draft Community Group Report" (latest 30.09.2026). That means it is **not a W3C standard yet and not on the standards track** **[source]**.

### Browser and agent support (as of 02.10.2026)

| Browser / agent | Status | Marker |
|---|---|---|
| Chrome | Flag `#enable-webmcp-testing` (early preview since Chrome 146), public **origin trial since Chrome 149** (real users, no flag needed on sites that register) | [source] |
| Edge | **Origin trial since Edge 150** | [source] |
| Brave | Experimental support in its Leo AI chat | [source] |
| Firefox (Mozilla) | Standards position **neutral** - no implementation planned | [source] |
| Safari (WebKit / Apple) | Standards position **oppose** - concerns about API design, duplication with the accessibility tree, privacy, security, use cases | [source] |
| Gemini in Chrome | Google announced in May 2026: "Gemini in Chrome will soon support WebMCP APIs" **[source]**. Our test in Chrome 154 (26.09.2026): no page tools used yet **[our test]** | |
| Claude in Chrome | Uses the tools if told where they are (one-line hint) **[our test]** | |
| ChatGPT Desktop | Listed as supported in the spec's implementation status | [source] |

### Early adopters

- **Shopify** (05.08.2026): WebMCP tools are switched on for every Liquid storefront (search, cart, checkout start), with nothing to install. Checkout tools followed on 28.09.2026 **[source]**.
- **Cloudflare** (06.08.2026): a developer preview that injects a WebMCP bridge script into any site behind Cloudflare at the network edge, "no code and nothing changed at your origin" **[source]**. This is the same pattern as our adapter: the tools are injected, not built by the site.
- Google lists Expedia, Booking.com, Etsy, Instacart, Target and others as "experimenting" **[source]**.

Current limits of our own setup: see the [README](../README.md).

**Key point:** Google and Microsoft drive it, it runs as a trial in Chrome and Edge, and large platforms (Shopify, Cloudflare) already ship it - but it is not a W3C standard yet.

---

## 6. Will WebMCP stick? Outlook, potentials, risks, competing technologies

> **Will it last?** Think of USB-C. Android phones and laptops moved to it while Apple kept its own Lightning plug for years - until the iPhone 15 switched to USB-C in 2023. A standard wins when enough devices use it, not when everyone agrees on day one.
>
> **Value added:** How safe is the bet, and what happens if it loses? Short answer: in Chromium browsers it is very likely to stay, and our investment is in the app knowledge (the manifest), which keeps its value even without WebMCP.
>
> **Watch out:** Without Safari there are no page tools on iPhones and Macs with Safari. Plans that depend on end users' browsers must factor that in - test execution in Chromium is not affected.

### Outlook rating (02.10.2026)

| Question | Rating | Confidence |
|---|---|---|
| Will WebMCP stay in Chrome and Edge for the next years? | **Very likely** | High |
| Will it become a cross-browser W3C standard (including Safari and Firefox)? | **Open** | Low |
| Will AI agents use page tools by default? | **Likely**, within 12-18 months | Medium |

**Signals for:**

- The two browser vendors behind Chromium (Chrome + Edge, most desktop traffic) co-author it and run origin trials **[source]**.
- Large platforms ship it in production: Shopify on millions of storefronts, Cloudflare at the edge **[source]**.
- Agents are adopting it: ChatGPT Desktop and Brave are listed, Google has announced it for Gemini in Chrome **[source]**, and Claude in Chrome uses it in our test **[our test]**.
- Built on MCP, which is now under neutral governance (Linux Foundation) and backed by every major AI vendor **[source]**.
- Chrome invests in tooling: a dedicated DevTools panel **[our test]**.

**Signals against:**

- Only a Community Group draft. A proposal to move it into a W3C Working Group drew an objection from Apple ("Expect a formal objection if this is merged"). The discussion is now moving towards a separate "Agentic Web" working group **[source]**.
- WebKit (Safari) **opposes** it, and Mozilla is **neutral** **[source]**. Without Safari there is no tool support on iPhones.
- The API is still changing: it moved from `navigator` to `document` in May 2026 **[source]**.
- Agents don't look for page tools by default yet. Gemini in Chrome 154 did not use them in our test **[our test]**.

**What would change the rating:** WebMCP enabled by default in Chrome stable (outside the trial), Gemini or Copilot using page tools by default, a W3C working group charter that includes it, or a change in Apple's or Mozilla's position.

**History lesson:** Chromium-only APIs can live for years without Safari (examples: WebUSB, Web Bluetooth). For **testing**, Chromium-only is no limit at all: Playwright in Test Manager runs Chromium only anyway.

### Potentials

| Potential | For testing | For the business |
|---|---|---|
| Stable test interface | Tests call purpose, not appearance - fewer flaky tests | Less maintenance effort |
| Speed | ~0.4 s for a full loan application **[our test]** vs seconds per field when clicking | Faster feedback, cheaper runs |
| One contract for tests and agents | The same tool is called by a Playwright test and by an AI agent | One investment, two uses |
| Structured results | JSON result + evidence instead of screenshots to interpret | Mechanical triage: app bug vs adapter bug |
| Assist mode | - | Agents help end users fill forms in existing apps |
| Discoverability | DevTools shows what a page can do | Faster onboarding of new apps |

### Risks

| Risk | What it means | Our mitigation |
|---|---|---|
| Spec churn | API names and behavior still change | The runtime has a single integration point. Our own fire-and-poll bridge works without WebMCP |
| Chromium only | No Safari / Firefox support | Irrelevant for test execution (Chromium). Relevant for assist mode on end-user devices |
| Prompt injection | Malicious text in tool descriptions can steer an agent - the spec lists this as a risk itself **[source]** | We generate our tool descriptions from the manifest under review in Git, and the real gate stays outside the page |
| Session abuse | A tool runs with the user's login | `confirm: true` on write tools, human sign-off on rules, test users only |
| Tools that lie | A tool reports "done", but the UI shows something else (WebKit's "duplication" concern) | The runtime reads the outcome from the page (URL, DOM), and the audit proves that only the tool touched the form |
| Test oracle gap | Testing through a tool skips the UI the user really sees | Keep a small set of classic UI tests for layout and usability |
| Vendor terms | Injecting tools into third-party apps can touch license terms | Clarify per app, we use test environments only |

### Competing and neighboring technologies

| Technology | What it is | Backed by | Strength | Weakness | Relation to WebMCP |
|---|---|---|---|---|---|
| Computer-use / vision agents | AI looks at screenshots and clicks pixels (Claude computer use, OpenAI agent mode, Gemini auto browse) | Anthropic, OpenAI, Google | Works on every app, no cooperation needed | Slow, costly, non-deterministic | Fallback when there are no tools |
| DOM / accessibility-tree agents | AI reads the page structure and acts on elements (Playwright MCP, Browser Use, Stagehand, Skyvern) | Microsoft (Playwright), open source | Faster than pixels, deterministic actions | Still guesses meaning, many steps | **We use this for discovery** - it generates our tools |
| Classic test locators | Playwright, Selenium, Cypress with CSS/role locators | Open source | Mature, everywhere | Flaky, maintenance (chapter 2) | WebMCP tools sit on top: the runtime still uses selectors, but in one place |
| Server-side MCP / APIs (OpenAPI) | The vendor offers an API or MCP server | Every vendor | Fast, no UI at all | Needs the vendor, separate auth, tests the API instead of the app the user sees | Complementary: backend vs front end |
| NLWeb | Microsoft open project: a natural-language query endpoint per site, every instance is also an MCP server | Microsoft | Good for content and search | Read-oriented, server-side | Complementary |
| llms.txt and similar files | A Markdown file that describes a site for AI | Community, many tech companies | Trivial to add | Documentation only, no actions | Complementary |
| UTCP and other tool protocols | Lighter alternatives to MCP for calling tools | Open source | Simple | Small ecosystem | Competes with MCP, not with WebMCP |
| A2A (Agent2Agent) | Protocol for agents talking to agents | Google, Linux Foundation | Multi-agent orchestration | A different layer | Complementary |
| MCP Apps / OpenAI Apps SDK | The app runs *inside* the chat agent | OpenAI, MCP community | Rich UI in chat | Reverse direction | Complementary |

WebKit's main argument is that the **accessibility tree** already describes what a page can do, so a separate tool registry is a duplicate. For testing, both have a place: the accessibility tree is what discovery reads, and the tool is what tests and agents call.

### Our hedge

The valuable asset is the **manifest** - the app knowledge in Git (pages, fields, rules, tools). WebMCP is only one way to deliver it. The same manifest already feeds our fire-and-poll bridge (`window.__webmcp`, works without WebMCP) and the Playwright tests, and it could feed a classic MCP server. If WebMCP lost, we would replace one adapter, not the factory.

**Key point:** In Chromium browsers WebMCP is very likely to stay, the cross-browser standard is still open, and our approach pays off either way.

---

## 7. The catch and our twist: inject it ourselves

> **What if the app has no tools?** The restaurant has no menu. So we write one for it and bring it along every time we eat there. The kitchen stays the same.
>
> **Value added:** We don't wait for vendor roadmaps. Every web app we test - including third-party and SaaS apps - can get tools now, without the vendor changing anything.
>
> **Watch out:** Injected tools depend on the app's current pages. When the vendor ships a new UI, the manifest has to be rediscovered, and license terms of third-party apps must allow it.

- WebMCP assumes that the **website owner** adds the tools. Shopify did that for its stores.
- Vendors of core business applications (core banking, SaaS providers) won't ship WebMCP tools anytime soon.
- So we **inject** them: a generic runtime (written once) plus an app manifest (generated by discovery) is loaded into every page by Playwright. The page then registers the tools with the browser as if the vendor had built them **[our test]**.
- Cloudflare does the same at the network edge for sites it serves **[source]**. That confirms the pattern - we do it for apps we don't serve.

How the two layers (runtime + manifest) work: [README.md](../README.md) and [discovery.md](discovery.md).

**Key point:** Vendors won't ship tools for us, so we inject them ourselves - generic runtime plus generated manifest.

---

## 8. Trust and security in brief

> **How do we know what the tool did?** A referee watches the game and confirms that only the right player touched the ball.
>
> **Value added:** Autonomy needs proof. Every run carries evidence of what the tool did - and that nothing else interfered.
>
> **Watch out:** A tool runs with the user's login, and its description is text the AI reads. A malicious page could hide instructions there (prompt injection), so tools are only as trustworthy as the page that publishes them.

- **Same session:** a tool runs with the user's login. Use test users and test environments.
- **Same origin:** a page can only publish tools for itself. Cross-origin iframes need an explicit permission **[source]**.
- **Prompt injection:** tool descriptions are text an AI reads, so a malicious page could hide instructions there **[source]**. Our descriptions come from the reviewed manifest.
- **`confirm: true`** on write tools prevents accidental calls. It is a safeguard, not a security control - the real gate sits outside the page.
- **Interaction audit:** the runtime proves that only the tool changed the form (no typing, no foreign scripts), and the audit travels with every result into Test Manager (screenshots: [webmcp-evidence.md](webmcp-evidence.md)).

**Key point:** The tool runs with the user's session, so we limit what it can do and audit what it did.

---

## 9. Glossary

| Term | Meaning |
|---|---|
| Agent | An AI that pursues a goal by calling tools in a loop |
| MCP | Model Context Protocol - the standard plug between agents and tools |
| WebMCP | Web standard proposal: a web page publishes tools for agents in the browser |
| Tool | A named function with a description and an input schema |
| Input schema | JSON Schema that defines a tool's parameters (names, types, required) |
| Imperative / declarative API | Tools registered with JavaScript / by annotating an HTML form |
| Origin trial | A Chrome/Edge mechanism to test a new web API with real users before it ships |
| Locator | How a test finds an element (CSS, XPath, role, text) |
| Page object | Test code that wraps a page's locators behind methods |
| Flaky test | A test that fails without a real bug |
| Accessibility tree | The browser's structured view of a page for screen readers - also used by test tools and agents |
| Runtime | Our injected JavaScript: registers tools, fills forms, audits, reports. Written once |
| Manifest | The app's knowledge as JSON in Git: pages, fields, selectors, rules, tools |
| Injection | Loading our runtime and manifest into a page we don't own |

---

## 10. Sources

Checked 01.-02.10.2026.

**Specification and browsers**
- [WebMCP specification (W3C Web Machine Learning CG, Draft CG Report)](https://webmachinelearning.github.io/webmcp/)
- [WebMCP explainer and repository](https://github.com/webmachinelearning/webmcp)
- [WebMCP implementation status](https://github.com/webmachinelearning/webmcp/blob/main/implementation-status.md)
- [Chrome for Developers: WebMCP](https://developer.chrome.com/docs/ai/webmcp)
- [Chrome for Developers: Imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api)
- [Chrome for Developers: Declarative API](https://developer.chrome.com/docs/ai/webmcp/declarative-api)
- [Chrome at Google I/O 2026 (Gemini in Chrome, partners)](https://developer.chrome.com/blog/chrome-at-io26?hl=en)
- [Microsoft Edge Origin Trials: WebMCP](https://developer.microsoft.com/en-us/microsoft-edge/origin-trials/trials/0b76fe60-b266-458e-a285-04e375c0c31a)

**Standards positions**
- [WebKit standards position: WebMCP (#670) - oppose](https://github.com/WebKit/standards-positions/issues/670)
- [Mozilla standards position: WebMCP (#1412) - neutral](https://github.com/mozilla/standards-positions/issues/1412)
- [W3C charter draft: WebMCP in the Web Machine Learning WG (#829, open)](https://github.com/w3c/charter-drafts/pull/829)

**Adopters**
- [Shopify changelog: WebMCP support for Liquid and Hydrogen storefronts](https://shopify.dev/changelog/webmcp-liquid-hydrogen)
- [Cloudflare: Give any website a WebMCP interface](https://blog.cloudflare.com/webmcp/)

**MCP and neighbors**
- [MCP joins the Agentic AI Foundation](https://blog.modelcontextprotocol.io/posts/2025-12-09-mcp-joins-agentic-ai-foundation/)
- [Microsoft: Introducing NLWeb](https://news.microsoft.com/source/features/company-news/introducing-nlweb-bringing-conversational-interfaces-directly-to-the-web/)
- [MCP vs RAG vs NLWeb vs HTML - agent interface comparison (arXiv 2511.23281)](https://arxiv.org/pdf/2511.23281)

**Secondary (background, history, opinion)**
- [Zuplo: What is WebMCP (origin story, MCP-B)](https://zuplo.com/blog/what-is-webmcp)
- [Spronta: The State of WebMCP, July 2026](https://www.spronta.com/blog/state-of-webmcp-july-2026/)
- [Builder.io: Everyone's missing the point of WebMCP](https://www.builder.io/blog/webmcp)

**Our own evidence**
- [webmcp-evidence.md](webmcp-evidence.md) - DevTools panel, Claude vs Gemini in Chrome, audit
- [form-filling-internals.md](form-filling-internals.md) - how the runtime fills forms
