# Form Filling & Runtime Internals

How the injected WebMCP runtime populates web forms from tool arguments without direct DOM manipulation by test runners or AI agents.

---

## Core Principle: Decoupled DOM Interaction

When an AI agent (such as Claude in Chrome) or test runner (Playwright) executes a WebMCP tool (e.g. `document.modelContext.executeTool('applyForLoan', args)`), **neither the AI agent nor Playwright touches the DOM directly**.

- Playwright and the AI agent interact solely with the high-level tool interface defined by the browser context.
- The actual DOM resolution, element population, event dispatching, and form submission are handled entirely by the injected in-page runtime ([runtime/webmcp-runtime.js](../runtime/webmcp-runtime.js)) driven by declarative app manifests ([manifests/uibank.manifest.json](../manifests/uibank.manifest.json)).

```
+-------------------------------------------------------+
|  Caller: AI Agent or Playwright Test Runner           |
+---------------------------+---------------------------+
                            |
           document.modelContext.executeTool(name, args)
                            |
+---------------------------v---------------------------+
|  Injected WebMCP Runtime (in browser tab)             |
|                                                       |
|  1. Step Engine parses manifest steps ("fill", etc.)  |
|  2. Matches tool arguments to manifest field selectors|
|  3. Invokes native prototype setters (setNativeValue) |
|  4. Dispatches bubbling reactive event cascade (fire) |
|  5. Stamps Interaction Audit as legitimate tool write |
|  6. Provides visual highlight & floating panel status |
+---------------------------+---------------------------+
                            |
              Direct native browser mutations
                            |
+---------------------------v---------------------------+
|  Target Web Application (e.g. Angular in UiBank)      |
+-------------------------------------------------------+
```

---

## Detailed Step-by-Step Flow

### 1. Tool Invocation & Step Dispatch
The target application manifest declares the tool and its execution pipeline:
```json
{
  "tools": {
    "applyForLoan": {
      "steps": [
        { "step": "fill", "form": "loanApplication" },
        { "step": "click", "selector": "#submitButton" },
        { "step": "waitFor", "signals": ["loanApproved", "loanDenied"] }
      ]
    }
  }
}
```

When the tool is triggered, the runtime creates a session job (`sessionStorage`) and steps through the plan. When the runner reaches `"fill"`, the internal `fill(job, m, formName)` handler executes inside the web page.

### 2. Selector Resolution & Readiness Checks
The runtime looks up `manifest.forms[formName]`:
1. It compares the keys in `job.args` (`amount`, `term`, `income`, `age`) with the configured field definitions in the manifest.
2. For each key, it resolves the corresponding element using `document.querySelector(field.selector)`.
3. If elements are not yet present in the DOM (for instance, during client-side hydration), the runtime waits up to `elementDeadline` before failing with an element error.

### 3. Overcoming Framework Hijacking (`setNativeValue`)
In modern single-page applications built with Angular, React, or Vue, simple JavaScript assignments like `element.value = "100000"` fail. Reactive frameworks override `HTMLInputElement.prototype.value` getters and setters with their own proxies to track data binding:
- Direct assignment changes the DOM property, but the framework's internal models (e.g., Angular's `ngModel` or React's internal state) are bypassed.
- When the form is submitted, the framework treats the field as empty or pristine (`ng-pristine ng-invalid`).

To bypass framework interceptors, the runtime fetches the browser's original native prototype property descriptor directly ([runtime/webmcp-runtime.js](../runtime/webmcp-runtime.js#L142-L147)):

```javascript
function setNativeValue(el, value) {
  var proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype
    : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
}
```

This writes the argument value directly to the browser's native DOM value slot.

### 4. Simulating Framework Event Cascades (`fire`)
After setting the native value, the runtime dispatches the standard event cascade expected by reactive frameworks ([runtime/webmcp-runtime.js](../runtime/webmcp-runtime.js#L149-L151)):

```javascript
function fire(el, events) {
  events.forEach(function (t) {
    el.dispatchEvent(new Event(t, { bubbles: true }));
  });
}
```

By default, the event sequence is `['input', 'change', 'blur']`:
- **`input`**: Triggers Angular `ngModelChange`, updates reactive control states, and transitions classes from `ng-invalid` to `ng-valid`.
- **`change`**: Triggers standard DOM change listeners and dropdown state sync.
- **`blur`**: Marks the field as touched (`ng-touched`), dismissing validation tooltips.

### 5. Control-Specific Input Handling (`setField`)
The runtime adjusts its approach depending on the HTML control type ([runtime/webmcp-runtime.js](../runtime/webmcp-runtime.js#L153-L169)):
- **Dropdowns (`<select>`)**: Matches options by value or visible text (e.g. matching `"5"` against option text `"5"`), assigns the matched option's value to the select element, and dispatches change events.
- **Checkboxes & Radios**: Checks `if (el.checked !== Boolean(value)) el.click();` to use native click mechanics for toggle state.
- **Text & Numeric Inputs**: Sets the value string via `setNativeValue` and fires the event cascade.

### 6. Interaction Audit & Visual Feedback
To ensure tests and agents can be audited:
1. **Legitimate Tool Flag**: While the runtime populates fields, it sets an internal boolean `writing = true`.
2. **Audit Certification**: The built-in Interaction Audit Engine records these changes as originating from the registered WebMCP tool and marks `audit.clean: true` in the job record. Any concurrent user input, external script write, or synthetic event is flagged as outside tampering.
3. **Visual Highlight**: Each populated element receives a temporary visual outline (`outline: 3px solid #005fb8`), and the floating tools panel updates to reflect current execution and outcome.
