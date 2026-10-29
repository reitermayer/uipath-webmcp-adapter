/*
 * webmcp-runtime.js - generic WebMCP adapter runtime (page agnostic).
 *
 * Knows nothing about any specific app. All app knowledge comes from a
 * manifest passed to window.__webmcp.register(manifest).
 *
 * Bridge API (every call returns a JSON string, so any driver - Playwright,
 * Playwright MCP, UiPath Inject Js Script - can pass it through unchanged):
 *   __webmcp.register(manifest)   -> {"ok":true,"app":...,"tools":[...]}
 *   __webmcp.list()               -> tools available on this origin
 *   __webmcp.start(tool, args)    -> job view with "id" (fire)
 *   __webmcp.poll(id)             -> job view (poll until status != "running")
 *
 * Jobs live in sessionStorage, so they survive postbacks and full navigations
 * as long as the runtime and manifest are injected again on the next page
 * (Playwright addInitScript does that automatically).
 *
 * Rules: no eval / new Function, no fetch to external hosts.
 * "confirm: true" on write tools only guards against accidental calls.
 */
(function () {
  'use strict';
  if (window.__webmcp) return;

  var VERSION = '0.1.0';
  var STORE_KEY = '__webmcp.jobs.v1';
  var MAX_JOBS = 50;
  var TICK_MS = 100;
  var DEFAULT_WAIT = { intervalMs: 100, maxTries: 50 };
  var DEFAULT_TIMEOUT_MS = 10000;
  var DEFAULT_EVENTS = ['input', 'change', 'blur'];
  var COLOR_FIELD = '#ff8c00';
  var COLOR_OK = '#1e9e4a';
  var COLOR_FAIL = '#c62828';

  var manifests = {};   // app -> manifest
  var driving = {};     // job id -> true while this page drives it

  // ---------- storage ----------

  function loadJobs() {
    try { return JSON.parse(sessionStorage.getItem(STORE_KEY) || '{}'); }
    catch (e) { return {}; }
  }

  function saveJob(job) {
    job.updatedAt = Date.now();
    var jobs = loadJobs();
    jobs[job.id] = job;
    var ids = Object.keys(jobs);
    if (ids.length > MAX_JOBS) {
      ids.sort(function (a, b) { return jobs[a].updatedAt - jobs[b].updatedAt; });
      ids.slice(0, ids.length - MAX_JOBS).forEach(function (id) {
        if (jobs[id].status !== 'running') delete jobs[id];
      });
    }
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify(jobs)); } catch (e) { /* quota - keep going in memory */ }
  }

  function getJob(id) { return loadJobs()[id] || null; }

  function log(job, msg) {
    job.log.push({ t: Date.now() - job.startedAt, msg: msg });
    if (job.log.length > 100) job.log.shift();
  }

  // ---------- helpers ----------

  function newId() {
    return 'j' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function findTool(name) {
    for (var app in manifests) {
      var m = manifests[app];
      if (m.tools && m.tools[name]) return { manifest: m, tool: m.tools[name] };
    }
    return null;
  }

  function onOrigin(m) {
    try { return new URL(m.baseUrl).origin === location.origin; } catch (e) { return false; }
  }

  function pageMatches(m, pageName) {
    var p = m.pages && m.pages[pageName];
    if (!p) throw err('manifest', 'Unknown page "' + pageName + '"');
    return new RegExp(p.match).test(location.pathname);
  }

  function err(kind, message, extra) {
    var e = new Error(message);
    e.kind = kind;
    if (extra) e.extra = extra;
    return e;
  }

  function waitSettings(m) {
    var w = (m.framework && m.framework.waitForElement) || {};
    return {
      intervalMs: w.intervalMs || DEFAULT_WAIT.intervalMs,
      maxTries: w.maxTries || DEFAULT_WAIT.maxTries
    };
  }

  function elementDeadline(job, m) {
    if (!job.stepDeadline) {
      var w = waitSettings(m);
      job.stepDeadline = Date.now() + w.intervalMs * w.maxTries;
    }
    return job.stepDeadline;
  }

  // ---------- input validation (small JSON Schema subset) ----------

  function validate(schema, args) {
    var problems = [];
    if (!schema) return problems;
    (schema.required || []).forEach(function (k) {
      if (args[k] === undefined || args[k] === null || args[k] === '') problems.push(k + ': required');
    });
    var props = schema.properties || {};
    Object.keys(args).forEach(function (k) {
      var s = props[k], v = args[k];
      if (!s) { problems.push(k + ': unknown argument'); return; }
      if (v === undefined || v === null) return;
      var t = s.type;
      if (t === 'string' && typeof v !== 'string') problems.push(k + ': must be a string');
      if (t === 'number' && typeof v !== 'number') problems.push(k + ': must be a number');
      if (t === 'integer' && !Number.isInteger(v)) problems.push(k + ': must be an integer');
      if (t === 'boolean' && typeof v !== 'boolean') problems.push(k + ': must be a boolean');
      if (s.enum && s.enum.indexOf(v) === -1) problems.push(k + ': must be one of ' + s.enum.join(', '));
      if (typeof v === 'number' && s.minimum !== undefined && v < s.minimum) problems.push(k + ': must be >= ' + s.minimum);
      if (typeof v === 'number' && s.maximum !== undefined && v > s.maximum) problems.push(k + ': must be <= ' + s.maximum);
      if (s.format === 'email' && typeof v === 'string' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) problems.push(k + ': must be an email address');
    });
    return problems;
  }

  // ---------- framework-safe input ----------

  function setNativeValue(el, value) {
    var proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype
      : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  }

  function fire(el, events) {
    events.forEach(function (t) { el.dispatchEvent(new Event(t, { bubbles: true })); });
  }

  function setField(el, field, value, events) {
    if (field.control === 'select') {
      var want = String(value).trim();
      var byValue = field.matchOptionBy === 'value';
      var opt = Array.prototype.find.call(el.options, function (o) {
        return (byValue ? o.value : o.text.trim()) === want;
      });
      if (!opt) throw err('element', 'No option "' + want + '" in ' + field.selector);
      setNativeValue(el, opt.value);
    } else if (field.type === 'checkbox' || field.type === 'radio') {
      if (el.checked !== Boolean(value)) el.click();
      return;
    } else {
      setNativeValue(el, String(value));
    }
    fire(el, events);
  }

  // ---------- visual feedback ----------

  function highlight(el) {
    el.style.outline = '3px solid ' + COLOR_FIELD;
    el.style.outlineOffset = '2px';
  }

  function banner(text, ok) {
    if (!document.body) return;
    var b = document.getElementById('__webmcp-banner');
    if (!b) {
      b = document.createElement('div');
      b.id = '__webmcp-banner';
      b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;padding:8px 16px;' +
        'font:600 14px/1.4 system-ui,sans-serif;color:#fff;text-align:center;pointer-events:none;';
      document.body.appendChild(b);
    }
    b.style.background = ok === false ? COLOR_FAIL : COLOR_OK;
    b.textContent = 'WebMCP ' + VERSION + ' - ' + text;
    renderPanel();
  }

  // Tools panel (bottom right): which tools this page offers, whether the
  // browser's native WebMCP knows them, what is running and the last result.
  var PANEL_KEY = '__webmcp.panel.collapsed';

  function el(tag, css, text) {
    var e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function renderPanel() {
    if (!document.body) return;
    var apps = Object.keys(manifests).filter(function (a) { return onOrigin(manifests[a]); });
    var p = document.getElementById('__webmcp-panel');
    if (!apps.length) { if (p) p.remove(); return; }
    if (!p) {
      p = el('div', 'position:fixed;right:12px;bottom:12px;z-index:2147483647;max-width:360px;' +
        'background:rgba(20,24,28,.92);color:#e8e8e8;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.35);' +
        'font:12px/1.45 system-ui,sans-serif;overflow:hidden;');
      p.id = '__webmcp-panel';
      document.body.appendChild(p);
    }
    var collapsed = false;
    try { collapsed = sessionStorage.getItem(PANEL_KEY) === '1'; } catch (e) { /* storage blocked */ }

    // Latest job per tool.
    var jobs = loadJobs(), latest = {};
    Object.keys(jobs).forEach(function (id) {
      var j = jobs[id];
      if (!latest[j.tool] || j.startedAt > latest[j.tool].startedAt) latest[j.tool] = j;
    });

    p.textContent = '';
    var native = nativeTools.length > 0;
    var head = el('div', 'padding:6px 10px;background:' + COLOR_OK + ';color:#fff;font-weight:600;cursor:pointer;',
      'WebMCP ' + VERSION + ' - ' + apps.join(', ') + ' - ' +
      (native ? 'registered with browser WebMCP' : 'adapter registry only') + (collapsed ? '  [+]' : '  [-]'));
    head.addEventListener('click', function () {
      try { sessionStorage.setItem(PANEL_KEY, collapsed ? '0' : '1'); } catch (e) { /* storage blocked */ }
      renderPanel();
    });
    p.appendChild(head);
    if (collapsed) return;

    apps.forEach(function (app) {
      var m = manifests[app];
      Object.keys(m.tools).forEach(function (name) {
        var t = m.tools[name], j = latest[name];
        var row = el('div', 'padding:6px 10px;border-top:1px solid rgba(255,255,255,.08);');
        var title = el('div', 'font-weight:600;');
        title.appendChild(el('span', '', native ? name.replace(/[^A-Za-z0-9_-]/g, '_') : name));
        title.appendChild(el('span', 'margin-left:6px;padding:0 5px;border-radius:3px;font-size:10px;background:' +
          (t.kind === 'write' ? '#8a4b00' : '#2d5a88') + ';', t.kind || 'tool'));
        row.appendChild(title);
        var req = (publicSchema(t).required || []).join(', ');
        if (req) row.appendChild(el('div', 'opacity:.7;', 'inputs: ' + req));
        if (j) {
          var state = j.status === 'running' ? 'running'
            : j.status === 'error' ? 'error: ' + (j.error && j.error.message)
            : 'last call ok' + (j.result && j.result.outcome ? ' - result: ' + j.result.outcome : '');
          var color = j.status === 'running' ? COLOR_FIELD : j.status === 'error' ? '#ff6b6b' : '#6fdc8c';
          row.appendChild(el('div', 'color:' + color + ';', state + ' (' + new Date(j.startedAt).toLocaleTimeString() + ')'));
        }
        p.appendChild(row);
      });
    });

    var forms = currentForms();
    if (forms.length) {
      var entries = [];
      forms.forEach(function (f) { entries = entries.concat(outside.get(f.el) || []); });
      var fields = entries.map(function (e) { return e.field; }).filter(function (v, i, a) { return a.indexOf(v) === i; });
      p.appendChild(el('div', 'padding:6px 10px;border-top:1px solid rgba(255,255,255,.08);color:' +
        (entries.length ? '#ff6b6b' : '#6fdc8c') + ';',
        entries.length
          ? 'Outside input on form: ' + entries.length + (entries.length === 1 ? ' event' : ' events') + ' (' + fields.join(', ') + ')'
          : 'Form input: only by WebMCP tool'));
    }

    // Finished calls stay in sessionStorage across reloads - offer a way to start clean.
    if (Object.keys(latest).some(function (n) { return latest[n].status !== 'running'; })) {
      var clear = el('div', 'padding:4px 10px;border-top:1px solid rgba(255,255,255,.08);opacity:.7;cursor:pointer;text-align:right;',
        'clear results');
      clear.addEventListener('click', function () {
        var all = loadJobs();
        Object.keys(all).forEach(function (id) { if (all[id].status !== 'running') delete all[id]; });
        try { sessionStorage.setItem(STORE_KEY, JSON.stringify(all)); } catch (e) { /* storage blocked */ }
        renderPanel();
      });
      p.appendChild(clear);
    }
  }

  // ---------- interaction audit ----------
  // Who changed a manifest form: the tool (while `writing`) or someone else -
  // real keyboard/mouse input (isTrusted: a person, or an agent's click/type
  // actions), synthetic events from other scripts, or values set by script
  // without any event (caught by comparing with the last known legit value).

  var writing = false;
  var baselines = new WeakMap(); // form element -> { at, values }
  var outside = new WeakMap();   // form element -> [ { type, field, trusted, at } ]
  var AUDIT_EVENTS = ['keydown', 'input', 'change', 'paste', 'drop', 'mousedown', 'click'];
  var panelQueued = false;

  function currentForms() {
    var list = [];
    Object.keys(manifests).forEach(function (app) {
      var m = manifests[app];
      if (!onOrigin(m)) return;
      Object.keys(m.forms || {}).forEach(function (name) {
        var f = m.forms[name], formEl = document.querySelector(f.selector);
        if (formEl) list.push({ app: app, name: name, form: f, el: formEl });
      });
    });
    return list;
  }

  function fieldValue(e) {
    return e.type === 'checkbox' || e.type === 'radio' ? String(e.checked) : e.value;
  }

  function takeBaselines() {
    currentForms().forEach(function (f) {
      if (baselines.has(f.el)) return;
      var values = {};
      Object.keys(f.form.fields).forEach(function (k) {
        var e = document.querySelector(f.form.fields[k].selector);
        if (e) values[k] = fieldValue(e);
      });
      baselines.set(f.el, { at: Date.now(), values: values });
    });
  }

  function recordOutside(formEl, entry) {
    var list = outside.get(formEl) || [];
    list.push(entry);
    if (list.length > 50) list.shift();
    outside.set(formEl, list);
    if (!panelQueued) {
      panelQueued = true;
      setTimeout(function () { panelQueued = false; renderPanel(); }, 150);
    }
  }

  function onAuditEvent(ev) {
    if (writing || !ev.target || !ev.target.closest) return;
    currentForms().forEach(function (f) {
      var field = null;
      Object.keys(f.form.fields).forEach(function (k) {
        var fe = document.querySelector(f.form.fields[k].selector);
        if (fe && (fe === ev.target || fe.contains(ev.target))) field = k;
      });
      if (!field && f.form.submit && ev.target.closest(f.form.submit.selector)) field = 'submit';
      if (field) recordOutside(f.el, { type: ev.type, field: field, trusted: ev.isTrusted, at: Date.now() });
    });
  }

  // Values that changed since the last legit state without any recorded event.
  function checkScriptWrites(f) {
    var base = baselines.get(f.el);
    if (!base) return;
    var seen = (outside.get(f.el) || []).map(function (e) { return e.field; });
    Object.keys(base.values).forEach(function (k) {
      var e = document.querySelector(f.form.fields[k].selector);
      if (e && fieldValue(e) !== base.values[k] && seen.indexOf(k) === -1) {
        recordOutside(f.el, { type: 'value-set-outside-tool', field: k, trusted: false, at: Date.now() });
      }
    });
  }

  function auditOf(formEl) {
    var entries = outside.get(formEl) || [];
    var base = baselines.get(formEl);
    return {
      clean: entries.length === 0,
      outsideInputs: entries.map(function (e) {
        return { type: e.type, field: e.field, trusted: e.trusted, at: new Date(e.at).toISOString() };
      }),
      watchedSince: base ? new Date(base.at).toISOString() : null
    };
  }

  // ---------- signals ----------

  function matchSignal(m, name) {
    var sig = m.signals && m.signals[name];
    if (!sig) throw err('manifest', 'Unknown signal "' + name + '"');
    if (sig.page && !pageMatches(m, sig.page)) return null;
    var groups = [];
    if (sig.urlMatch) {
      groups = location.pathname.match(new RegExp(sig.urlMatch));
      if (!groups) return null;
    }
    if (sig.selector && !document.querySelector(sig.selector)) return null;
    var invalid = null;
    if (sig.formInvalid) {
      var form = m.forms[sig.formInvalid];
      var f = form && document.querySelector(form.selector);
      if (!f || f.checkValidity()) return null;
      invalid = Array.prototype.filter.call(f.elements, function (e) {
        return e.willValidate && !e.checkValidity();
      }).map(function (e) { return e.id || e.name; });
    }
    var result = Object.assign({}, sig.result || {});
    Object.keys(sig.extract || {}).forEach(function (k) {
      var x = sig.extract[k];
      var v = x.urlGroup !== undefined ? groups[x.urlGroup] : null;
      if (v !== undefined && v !== null && x.type === 'number') v = Number(v);
      result[k] = v === undefined ? null : v;
    });
    if (invalid) result.invalidFields = invalid;
    var evidence = { signal: name, url: location.pathname };
    if (sig.expectText) {
      evidence.expectText = sig.expectText;
      evidence.textSeen = !!(document.body && document.body.innerText.indexOf(sig.expectText) !== -1);
    }
    return { result: result, evidence: evidence };
  }

  // ---------- steps ----------
  // Each returns 'next' (runner advances), 'advanced' (step already advanced
  // and saved - used before actions that may unload the page), 'wait' or
  // 'navigating'.

  var steps = {
    navigate: function (job, m, pageName) {
      if (pageMatches(m, pageName)) return 'next';
      var p = m.pages[pageName];
      var target = new URL(p.path, m.baseUrl).href;
      log(job, 'navigate ' + target);
      job.step++; job.stepDeadline = null;
      saveJob(job);
      location.assign(target);
      return 'navigating';
    },

    fill: function (job, m, formName) {
      var form = m.forms && m.forms[formName];
      if (!form) throw err('manifest', 'Unknown form "' + formName + '"');
      var events = (m.framework && m.framework.events) || DEFAULT_EVENTS;
      var keys = Object.keys(form.fields).filter(function (k) { return job.args[k] !== undefined; });
      var missing = keys.filter(function (k) { return !document.querySelector(form.fields[k].selector); });
      if (missing.length) {
        if (Date.now() < elementDeadline(job, m)) return 'wait';
        throw err('element', 'Fields not found: ' + missing.map(function (k) { return form.fields[k].selector; }).join(', '),
          { page: location.pathname });
      }
      var formEl = document.querySelector(form.selector);
      if (formEl) {
        takeBaselines();
        checkScriptWrites({ form: form, el: formEl });
      }
      writing = true;
      try {
        keys.forEach(function (k) {
          var field = form.fields[k];
          var el = document.querySelector(field.selector);
          setField(el, field, job.args[k], events);
          highlight(el);
          job.selectors[k] = field.selector;
          var base = formEl && baselines.get(formEl);
          if (base) base.values[k] = fieldValue(el); // the tool's value is the new legit state
        });
      } finally {
        writing = false;
      }
      job.auditForm = formName;
      log(job, 'filled ' + keys.join(', '));
      return 'next';
    },

    click: function (job, m, selector) {
      var el = document.querySelector(selector);
      if (!el) {
        if (Date.now() < elementDeadline(job, m)) return 'wait';
        throw err('element', 'Element not found: ' + selector, { page: location.pathname });
      }
      job.selectors['click:' + selector] = selector;
      log(job, 'click ' + selector);
      // Freeze the audit right before the action that may unload the page.
      var auditForm = job.auditForm && m.forms[job.auditForm];
      var formEl = auditForm && document.querySelector(auditForm.selector);
      if (formEl) {
        checkScriptWrites({ form: auditForm, el: formEl });
        job.audit = auditOf(formEl);
        if (!job.audit.clean) log(job, 'outside input on form: ' + job.audit.outsideInputs.length + ' events');
      }
      job.step++; job.stepDeadline = null;
      saveJob(job);
      writing = true;
      try { el.click(); } finally { writing = false; }
      return 'advanced';
    },

    waitFor: function (job, m, names, step) {
      if (!job.stepDeadline) job.stepDeadline = Date.now() + (step.timeoutMs || DEFAULT_TIMEOUT_MS);
      for (var i = 0; i < names.length; i++) {
        var hit = matchSignal(m, names[i]);
        if (hit) {
          job.result = hit.result;
          job.evidence = hit.evidence;
          log(job, 'signal ' + names[i]);
          return 'next';
        }
      }
      if (Date.now() < job.stepDeadline) return 'wait';
      throw err('timeout', 'None of the signals matched: ' + names.join(', '), { page: location.pathname });
    }
  };

  function stepKind(step) {
    for (var k in steps) if (step[k] !== undefined) return k;
    throw err('manifest', 'Unknown step ' + JSON.stringify(step));
  }

  // ---------- runner ----------

  function finish(job, status, error) {
    job.status = status;
    job.finishedAt = Date.now();
    job.stepDeadline = null;
    if (error) {
      job.error = {
        kind: error.kind || 'runtime',
        message: String(error.message || error),
        step: job.steps[job.step] || null,
        page: location.pathname,
        extra: error.extra || null,
        stack: error.stack || null
      };
      log(job, 'error ' + job.error.message);
    }
    saveJob(job); // before the banner, so the tools panel shows the final state
    if (error) {
      banner(job.tool + ' - error: ' + job.error.message, false);
    } else {
      var outcome = job.result && job.result.outcome ? ' - ' + job.result.outcome : '';
      banner(job.tool + outcome, true);
    }
  }

  function drive(id) {
    if (driving[id]) return;
    driving[id] = true;

    function tick() {
      var job = getJob(id);
      if (!job || job.status !== 'running') { delete driving[id]; return; }
      var found = findTool(job.tool);
      if (!found) { delete driving[id]; return; } // manifest not registered on this page yet
      var m = found.manifest;
      try {
        while (job.status === 'running') {
          if (job.step >= job.steps.length) { finish(job, 'done'); break; }
          var step = job.steps[job.step];
          var kind = stepKind(step);
          var r = steps[kind](job, m, step[kind], step);
          if (r === 'wait') { saveJob(job); break; }
          if (r === 'navigating') { delete driving[id]; return; }
          if (r === 'next') { job.step++; job.stepDeadline = null; saveJob(job); }
          if (r === 'advanced') {
            // The action may unload the page; if it does not, continue on the next tick.
            break;
          }
        }
      } catch (e) {
        finish(job, 'error', e);
      }
      if (job.status === 'running') setTimeout(tick, TICK_MS);
      else delete driving[id];
    }

    setTimeout(tick, 0);
  }

  function resume(app) {
    var jobs = loadJobs();
    Object.keys(jobs).forEach(function (id) {
      var j = jobs[id];
      if (j.status === 'running' && j.app === app) {
        banner(j.tool + ' - running', true);
        drive(id);
      }
    });
  }

  // ---------- public API ----------

  function view(job) {
    return {
      adapter: VERSION,
      id: job.id,
      tool: job.tool,
      app: job.app,
      manifest: job.manifest,
      status: job.status,
      step: job.step,
      steps: job.steps.length,
      result: job.result,
      evidence: job.evidence,
      audit: job.audit || null,
      error: job.error,
      selectors: job.selectors,
      startedAt: new Date(job.startedAt).toISOString(),
      durationMs: (job.finishedAt || Date.now()) - job.startedAt,
      log: job.log
    };
  }

  // Input schema as callers see it: write tools also require confirm: true.
  function publicSchema(t) {
    var s = JSON.parse(JSON.stringify(t.input || { type: 'object', properties: {} }));
    if (t.confirm) {
      s.properties = s.properties || {};
      s.properties.confirm = { type: 'boolean', const: true, description: 'Must be true - safeguard against accidental calls of a write tool' };
      s.required = (s.required || []).concat('confirm');
    }
    return s;
  }

  function toolInfo(name, m, t) {
    return {
      name: name, app: m.app, description: t.description, kind: t.kind,
      confirm: !!t.confirm, inputSchema: publicSchema(t)
    };
  }

  function start(name, args) {
    try {
      var found = findTool(name);
      if (!found) return JSON.stringify({ adapter: VERSION, status: 'error', error: { kind: 'input', message: 'Unknown tool "' + name + '"' } });
      var m = found.manifest, t = found.tool;
      args = Object.assign({}, args || {});
      var confirmed = args.confirm === true;
      delete args.confirm;
      var problems = validate(t.input, args);
      if (t.confirm && !confirmed) problems.push('confirm: write tool - pass confirm: true');
      if (problems.length) {
        return JSON.stringify({ adapter: VERSION, tool: name, status: 'error', error: { kind: 'input', message: 'Invalid arguments', problems: problems } });
      }
      var plan = [];
      if (t.navigateIfNeeded && t.page) plan.push({ navigate: t.page });
      (t.steps || []).forEach(function (s) { plan.push(s); });
      var job = {
        id: newId(), tool: name, app: m.app, args: args,
        manifest: { app: m.app, version: m.manifestVersion, generatedAt: m.generatedAt || null },
        status: 'running', step: 0, steps: plan, stepDeadline: null,
        result: null, evidence: null, error: null, selectors: {},
        startedAt: Date.now(), finishedAt: null, log: []
      };
      log(job, 'start');
      saveJob(job);
      banner(name + ' - running', true);
      drive(job.id);
      return JSON.stringify(view(job));
    } catch (e) {
      return JSON.stringify({ adapter: VERSION, tool: name, status: 'error', error: { kind: 'runtime', message: String(e.message || e), stack: e.stack || null } });
    }
  }

  function poll(id) {
    var job = getJob(id);
    if (!job) return JSON.stringify({ adapter: VERSION, id: id, status: 'unknown' });
    var found = findTool(job.tool);
    if (job.status === 'running' && found) drive(id);
    return JSON.stringify(view(job));
  }

  function list() {
    var tools = [];
    Object.keys(manifests).forEach(function (app) {
      var m = manifests[app];
      if (!onOrigin(m)) return;
      Object.keys(m.tools || {}).forEach(function (n) { tools.push(toolInfo(n, m, m.tools[n])); });
    });
    return JSON.stringify({ adapter: VERSION, origin: location.origin, tools: tools, nativeWebMCP: nativeTools });
  }

  // Expose tools to a native WebMCP host if the browser provides one.
  // Chrome 154 (flag #enable-webmcp-testing) has document.modelContext;
  // the draft spec names navigator.modelContext. registerTool gets a parsed
  // input object; the host serializes our return value.
  var nativeTools = [];

  function exposeToModelContext(m) {
    var mc = document.modelContext || navigator.modelContext;
    if (!mc || typeof mc.registerTool !== 'function' || !onOrigin(m)) return;
    Object.keys(m.tools || {}).forEach(function (name) {
      var t = m.tools[name];
      var nativeName = name.replace(/[^A-Za-z0-9_-]/g, '_');
      try {
        mc.registerTool({
          name: nativeName,
          description: t.description + (t.confirm ? ' Write tool: pass confirm: true.' : ''),
          inputSchema: publicSchema(t),
          execute: function (args) {
            var started = JSON.parse(start(name, args));
            return new Promise(function (resolve) {
              (function wait() {
                var v = started.id ? JSON.parse(poll(started.id)) : started;
                if (v.status === 'running') setTimeout(wait, 200);
                else resolve({ content: [{ type: 'text', text: JSON.stringify(v) }], isError: v.status === 'error' });
              })();
            });
          }
        });
        nativeTools.push(nativeName);
      } catch (e) { /* host rejected the tool - bridge API still works */ }
    });
  }

  function register(m) {
    try {
      if (!m || !m.app || !m.baseUrl || !m.tools) throw new Error('Manifest needs app, baseUrl and tools');
      var first = !manifests[m.app];
      manifests[m.app] = m;
      if (first) exposeToModelContext(m);
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { resume(m.app); renderPanel(); });
      } else {
        resume(m.app);
        renderPanel();
      }
      return JSON.stringify({ ok: true, adapter: VERSION, app: m.app, tools: Object.keys(m.tools) });
    } catch (e) {
      return JSON.stringify({ ok: false, adapter: VERSION, error: String(e.message || e) });
    }
  }

  // Watch manifest forms for input that does not come from a tool.
  AUDIT_EVENTS.forEach(function (t) { document.addEventListener(t, onAuditEvent, true); });
  setInterval(function () {
    takeBaselines();
    if (!writing) currentForms().forEach(checkScriptWrites);
  }, 250);

  window.__webmcp = {
    version: VERSION,
    register: register,
    list: list,
    start: start,
    poll: poll
  };

  // Manifests queued before the runtime loaded.
  (window.__webmcpManifests || []).forEach(register);
})();
