# Manifest format (manifestVersion 0.1)

The structure the runtime, `scripts/generate-cases.mjs` and the tests expect. Values in `<...>` come from your scan and probes. Keep the key names exactly.

```json
{
  "manifestVersion": "0.1",
  "app": "<app>",
  "title": "<human readable app name>",
  "baseUrl": "https://<host>",
  "generatedBy": "discovery (<agent> via <browser tool>)",
  "generatedAt": "DD.MM.YYYY HH:MM",
  "sources": ["discovery/<app>-<form>.raw.json", "discovery/<app>-<form>.probes.json"],

  "framework": {
    "name": "<angular|react|vue|none>",
    "spa": true,
    "input": "native-setter",
    "events": ["input", "change", "blur"],
    "waitForElement": { "intervalMs": 100, "maxTries": 50 }
  },

  "pages": {
    "<pageName>": {
      "path": "/<path>",
      "match": "^/<path regex>/?$",
      "title": "<page title>",
      "authRequired": false,
      "readyWhen": "<selector that exists once the page is usable>",
      "forms": ["<formName>"]
    },
    "<resultPageName>": {
      "path": "/<path>/{param}",
      "match": "^/<regex with groups>$",
      "params": ["<param>"]
    }
  },

  "forms": {
    "<formName>": {
      "page": "<pageName>",
      "selector": "<form container selector>",
      "submit": { "selector": "<selector>", "text": "<button text>" },
      "fields": {
        "<field>": { "selector": "#<id>", "control": "input", "type": "number", "label": "<label>", "required": false },
        "<choice>": { "selector": "#<id>", "control": "select", "label": "<label>", "required": true, "matchOptionBy": "text", "options": ["<a>", "<b>"] }
      },
      "backend": { "method": "POST", "url": "<request seen on submit, if visible>" }
    }
  },

  "signals": {
    "<successSignal>": {
      "page": "<resultPageName>",
      "urlMatch": "^<regex>$",
      "expectText": "<text shown on success>",
      "result": { "outcome": "<approved>" },
      "extract": { "<value>": { "urlGroup": 1 }, "<numericValue>": { "urlGroup": 2, "type": "number" } }
    },
    "<failureSignal>": {
      "page": "<resultPageName>",
      "urlMatch": "^<regex>$",
      "expectText": "<text shown on failure>",
      "result": { "outcome": "<denied>", "<value>": null },
      "reason": "<rule text the app shows, if any>"
    },
    "formBlocked": {
      "page": "<pageName>",
      "formInvalid": "<formName>",
      "description": "<what happens when validation stops the submit>",
      "result": { "outcome": "blocked" }
    }
  },

  "tools": {
    "<app>.<verbObject>": {
      "description": "<what the tool does, one sentence>",
      "kind": "write",
      "confirm": true,
      "page": "<pageName>",
      "navigateIfNeeded": "/<path>",
      "form": "<formName>",
      "input": {
        "type": "object",
        "required": ["<field>"],
        "properties": { "<field>": { "type": "number", "minimum": 0 } }
      },
      "steps": [
        { "fill": "<formName>" },
        { "click": "<submit selector>" },
        { "waitFor": ["<successSignal>", "<failureSignal>", "formBlocked"], "timeoutMs": 10000 }
      ],
      "output": { "type": "object", "properties": { "outcome": { "type": "string", "enum": ["<approved>", "<denied>", "blocked"] } } }
    },
    "<app>.read<Result>": {
      "description": "<read the outcome from the result page>",
      "kind": "read",
      "confirm": false,
      "page": "<resultPageName>",
      "steps": [{ "waitFor": ["<successSignal>", "<failureSignal>"], "timeoutMs": 3000 }],
      "output": { "type": "object" }
    }
  },

  "businessRules": {
    "<ruleSetName>": {
      "suite": "<Test suite name shown in Test Manager>",
      "tool": "<app>.<verbObject>",
      "fixedInputs": { "<field>": "<typical value used in all probes>" },
      "rules": [
        { "id": "R1", "text": "<rule in plain words>", "when": { "<field>": { "lt": 18 } }, "outcome": "<denied>" },
        { "id": "R2", "text": "<rule>", "when": { "<field>": { "gte": 18, "lte": 65 }, "<other>": { "gt": 100000 } }, "outcome": "<denied>" }
      ],
      "smoke": [
        { "title": "<typical case>", "inputs": { "<field>": 30 }, "outcome": "<approved>", "rule": "R3" }
      ],
      "documented": [
        { "rule": "<rule as the app states it>", "outcome": "<denied>", "source": "<where you found it>" }
      ],
      "observed": [
        { "<field>": 17, "outcome": "<denied>", "matchesDocs": true }
      ],
      "openQuestions": ["<untested area or unexplained outcome>"]
    }
  }
}
```

Rules for `businessRules`:
- Operators in `when`: `lt`, `lte`, `gt`, `gte`, `eq` - numbers only.
- Rules must not overlap with different outcomes; combinations no rule covers become gaps in Generate, never guesses.
- Every input in `when` and `fixedInputs` must be a property of the tool's input schema.
- Every rule needs at least one `observed` probe that matches its `when` and shows its `outcome`.
