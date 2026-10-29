# WebMCP intro slides - presenter notes

Internal, for the presenter. Reader-facing background: [webmcp-research.md](webmcp-research.md).
Deck: `DarkTestingFactory.pptx` (29 slides). Status: 02.10.2026.

## What changed in the deck

The old slide 7 ("WebMCP: tools instead of pixels") packed four ideas onto one slide, and the "USB port" tagline on the Act 2 divider assumed the audience already knew MCP. The paper is the handout - the slides carry only the story.

| # | Slide | Source in the paper | Status |
|---|---|---|---|
| 6 | MCP in 60 seconds | Ch. 1 | new, before the Act 2 divider |
| 7 | The enabler: WebMCP (divider) | - | unchanged |
| 8 | Why UI tests break | Ch. 2 | new |
| 9 | WebMCP: a menu for agents | Ch. 3 + flow from ch. 4 | new, replaces old slide 7 (flow and comparison table kept, MCP server column added, "Tests" row and end-to-end band) |
| 10 | API, GUI or WebMCP tests? | Ch. 2-4 | new: comparison table, speed, stability and "created by" rows highlighted (agent-only generation, no tokens per run); notes answer "can a real user still fill in the form?" |
| 11 | Google + Microsoft: will it stick? | Ch. 5, 6, 7 | new, ends with "the catch" as the hand-over to slide 12 |
| 12 | Two layers replace the Object Repository | - | unchanged (was 8, then 11) |
| 23 | Thank you | - | added: background paper reference |
| 24 | Appendix · Honest limits today | - | row 1 updated: origin trial instead of "behind a Chrome flag" |
| 26 | Appendix · Six terms | - | WebMCP: "Origin trial in Chrome 149+ and Edge 150+" |
| 27 | Appendix · Competing technologies | Ch. 6 table | new |
| 28 | Appendix · Risks and mitigations | Ch. 6 risk table | new |
| 29 | Appendix · Many tools, one agent | Ch. 4 "Many tools, one agent" | new |

How the three chapter-opening lines of the paper are used:

- The question + analogy is the orange footer line on each new main slide.
- "Value added" is in the speaker notes, not on the slide.
- "Watch out" appears only on slide 11 (who is not in yet, the catch) and in the risk appendix.

Speaker notes for every new slide are in the deck. Short versions:

- **6 MCP in 60 seconds:** "MCP is how an AI gets hands. A tool has a name, a description and an input schema - WebMCP brings exactly this into the web page."
- **8 Why UI tests break:** "A developer moves a field, twenty tests turn red, no bug. Our tests know where things are, not what they are for."
- **9 WebMCP: a menu for agents:** "MCP inside the page. It runs in the user's browser with the user's session, and you can watch it fill the form. About 0.4 seconds per loan application."
- **10 Will it stick?:** "Google and Microsoft build it together, Shopify switched it on for every store, Apple opposes it. For testing that hardly matters - we run Chromium. The catch: vendors won't ship tools soon, so we inject them."

## Before the talk

- Push `docs/webmcp-research.md` so that the link on the "Thank you" slide works (and check that the repository is visible to the audience, or share the paper as PDF).
- Optional live demo stays on slide 13 (Proof on UiBank), unchanged.
