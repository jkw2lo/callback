/* Runs on application forms. It reads what each field asks and tells the side panel which one
   you're on, then puts in what the panel sends: the value you clicked, or each clear answer when you press
   Fill the form. It never sees your saved info until then, never moves between pages and never
   submits anything.

   Quiet until the panel opens: without a panel listening, the connection below simply fails. */
(function () {
  "use strict";
  // Injected twice, it just says hello again. After the extension reloads, the old copy can't
  // reach it any more and returns false, so this copy takes over.
  if (window.__callbackFill && window.__callbackFill() !== false) return;

  var port = null;
  var fields = [];
  var current = null;
  var ids = new WeakMap();
  var nextId = 1;
  var lit = null;
  var marks = new Map(); // fields filled in one go, outlined until you finish reviewing
  var hush = 0;          // while filling in one go, your focus moving isn't you picking a field
  var watcher = null;
  var progressTimer = 0;
  var peeked = new WeakMap();

  var CONTROLS = 'input,select,textarea,button,[contenteditable="true"],[role="combobox"],[role="radio"],[role="checkbox"]';
  var SKIP_TYPES = /^(hidden|password|submit|button|reset|image|file|range|color)$/;
  var SKIP_NAMES = /captcha|csrf|token|honeypot|\bssn\b|social.?security|card.?number|\bcvv\b|\bcvc\b/i;
  var GENERIC_PLACEHOLDER = /^(type here|start typing|select|choose|search|enter|pick|write here)\b/i;

  function idOf(el) {
    if (!ids.has(el)) ids.set(el, nextId++);
    return ids.get(el);
  }
  function line(s) { return String(s == null ? "" : s).replace(/\s+/g, " ").trim(); }
  function wait(ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); }

  // ---------- what's visible ----------
  function shown(el) {
    if (!el || !el.getClientRects || !el.getClientRects().length) return false;
    var style = getComputedStyle(el);
    return style.visibility !== "hidden" && style.display !== "none";
  }
  function roomy(el) {
    var r = el.getBoundingClientRect();
    return r.width >= 8 && r.height >= 8 && getComputedStyle(el).opacity !== "0";
  }

  // ---------- reading labels ----------
  // The words on screen: labels can also hold a dropdown's options or a hidden error message
  function textOf(el) {
    if (!el) return "";
    var out = "";
    (function read(node) {
      node.childNodes.forEach(function (n) {
        if (n.nodeType === 3) { out += n.nodeValue; return; }
        if (n.nodeType !== 1 || n.matches("select,option,input,textarea,button,svg,style,script,[aria-hidden='true'],.required")) return;
        if (!n.checkVisibility()) return;
        read(n);
        if (/^(DIV|P|LI|BR|SPAN)$/.test(n.tagName)) out += " ";
      });
    })(el);
    return line(out).replace(/[*✱]\s*$/, "").trim();
  }
  function byIds(el, attr) {
    var list = (el.getAttribute(attr) || "").split(/\s+/).filter(Boolean);
    var scope = el.getRootNode();
    return list.map(function (id) { return scope.getElementById ? scope.getElementById(id) : null; }).filter(Boolean);
  }
  function hasControl(el) {
    return !!el.querySelector("input:not([type=hidden]),select,textarea,button,[role=radio],[role=checkbox],[role=combobox]");
  }
  // The question above a control or group, for forms that don't link their labels
  function questionFor(members) {
    var first = members[0];
    var box = first.parentElement;
    for (var depth = 0; box && depth < 8; depth++, box = box.parentElement) {
      if (!members.every(function (m) { return box.contains(m); })) continue;
      // Once this reaches another field, any label found would be that field's
      var others = box.querySelectorAll("input:not([type=hidden]),select,textarea");
      var strangers = Array.prototype.some.call(others, function (o) { return members.indexOf(o) < 0 && memberShown(o); });
      if (strangers) break;
      var found = lastBefore(box, first, members, 'label,legend,[role="heading"],h2,h3,h4,h5,h6') ||
        lastBefore(box, first, members, '[class*="label" i],[class*="title" i],[class*="question" i],[id$="-label"]');
      if (found) return found;
    }
    return textJustBefore(first);
  }
  function lastBefore(box, first, members, selector) {
    var found = "";
    box.querySelectorAll(selector).forEach(function (c) {
      if (!(c.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING)) return;
      if (c.matches('[class*="description" i],[class*="hint" i],[class*="help" i]')) return;
      if (c.querySelector("input,select,textarea") || (c.htmlFor && members.some(function (m) { return m.id === c.htmlFor; }))) return;
      var t = textOf(c);
      if (t && t.length <= 400) found = t;
    });
    return found;
  }
  function textJustBefore(el) {
    var at = el;
    for (var depth = 0; at && depth < 8; depth++, at = at.parentElement) {
      for (var p = at.previousElementSibling; p; p = p.previousElementSibling) {
        if (hasControl(p)) return "";
        if (p.matches('[class*="description" i],[class*="hint" i],[class*="help" i]')) continue;
        var t = textOf(p);
        if (t) return t.length <= 400 ? t : "";
      }
    }
    return "";
  }
  function labelOf(el, members) {
    if (members && members.length > 1) {
      var set = el.closest("fieldset");
      var legend = set && members.every(function (m) { return set.contains(m); }) ? set.querySelector("legend") : null;
      if (legend && textOf(legend)) return textOf(legend);
      var group = el.closest('[role="radiogroup"],[role="group"]');
      if (group) {
        var named = byIds(group, "aria-labelledby").map(textOf).join(" ") || group.getAttribute("aria-label");
        if (named) return line(named);
      }
      return questionFor(members);
    }
    var labels = el.labels ? Array.prototype.slice.call(el.labels) : [];
    var fromLabel = labels.map(textOf).filter(Boolean)[0];
    if (fromLabel) return fromLabel;
    var by = byIds(el, "aria-labelledby").map(textOf).filter(Boolean).join(" ");
    if (by) return by;
    var aria = line(el.getAttribute("aria-label")).replace(/\b(select one|required)\b/gi, "").replace(/\s+/g, " ").trim();
    if (aria) return aria;
    var q = questionFor([el]);
    if (q) return q;
    var ph = line(el.getAttribute("placeholder"));
    return ph && !GENERIC_PLACEHOLDER.test(ph) ? ph : line(el.getAttribute("title"));
  }
  function optionText(el) {
    var labels = el.labels ? Array.prototype.slice.call(el.labels) : [];
    return labels.map(textOf).filter(Boolean)[0] || line(el.getAttribute("aria-label")) || line(el.textContent) || line(el.value);
  }

  // ---------- finding the questions on the page ----------
  function walk(root, visit) {
    var els = root.querySelectorAll("*");
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.matches(CONTROLS)) visit(el);
      if (el.shadowRoot) walk(el.shadowRoot, visit);
    }
  }
  function kindOf(el) {
    var tag = el.tagName.toLowerCase();
    var role = el.getAttribute("role");
    if (el.getAttribute("aria-hidden") === "true" || el.disabled) return "";
    if (SKIP_NAMES.test((el.name || "") + " " + (el.id || ""))) return "";
    if (/^cc-/.test(el.getAttribute("autocomplete") || "")) return "";
    if (role === "radio" || el.type === "radio") return "radio";
    if (role === "checkbox" || el.type === "checkbox") return "checkbox";
    if (tag === "button") {
      var pop = el.getAttribute("aria-haspopup");
      return pop === "listbox" || pop === "true" ? "listbox" : el.getAttribute("type") !== "submit" ? "button" : "";
    }
    if (role === "combobox" && tag !== "select") return "combobox";
    if (tag === "select") return "select";
    if (tag === "textarea") return "textarea";
    if (tag === "input") {
      if (SKIP_TYPES.test(el.type)) return "";
      if (el.getAttribute("aria-autocomplete") === "list") return "combobox";
      return "text";
    }
    return el.isContentEditable ? "editable" : "";
  }
  // Radios and checkboxes are often invisible behind a styled label
  function memberShown(el) {
    if (shown(el) && roomy(el)) return true;
    var labels = el.labels ? Array.prototype.slice.call(el.labels) : [];
    return labels.some(shown);
  }

  function collect() {
    var raw = [];
    var nameCount = {};
    walk(document, function (el) {
      var kind = kindOf(el);
      if (!kind) return;
      raw.push({ el: el, kind: kind });
      if (kind === "checkbox" && el.name) nameCount[el.name] = (nameCount[el.name] || 0) + 1;
    });

    var found = [];
    var groups = {};
    var buttonGroups = new Map();
    raw.forEach(function (c) {
      var el = c.el;
      if (c.kind === "radio" || c.kind === "checkbox") {
        if (!memberShown(el)) return;
        var box = el.closest("fieldset,[role='group'],[role='radiogroup']");
        var key = "";
        if (c.kind === "radio") key = "r:" + (el.name || (box && idOf(box)) || idOf(el));
        else if (el.name && nameCount[el.name] > 1) key = "c:" + el.name;
        else if (box && box.querySelectorAll("input[type=checkbox],[role=checkbox]").length > 1) key = "b:" + idOf(box);
        if (key && groups[key]) { groups[key].members.push(el); return; }
        var field = { type: c.kind, el: el, members: [el], box: null };
        if (key) groups[key] = field;
        found.push(field);
      } else if (c.kind === "button") {
        // Yes and No buttons standing in for a question
        var parent = el.parentElement;
        if (!parent || !shown(el)) return;
        var kids = parent.querySelectorAll(":scope > button");
        if (kids.length < 2 || kids.length > 5) return;
        var texts = Array.prototype.map.call(kids, function (b) { return line(b.textContent).toLowerCase(); });
        if (texts.indexOf("yes") < 0 || texts.indexOf("no") < 0) return;
        if (buttonGroups.has(parent)) return;
        var f = { type: "buttons", el: el, members: Array.prototype.slice.call(kids), box: parent };
        buttonGroups.set(parent, f);
        found.push(f);
      } else {
        if (!shown(el)) return;
        if (c.kind !== "combobox" && !roomy(el)) return;
        if (el.getAttribute("tabindex") === "-1" && c.kind === "text") return;
        found.push({ type: c.kind, el: el, members: [el], box: null });
      }
    });

    found.forEach(function (f) { f.id = idOf(f.el); });
    return found;
  }

  function headingsBefore(el) {
    var list = el.getRootNode().querySelectorAll('h2,h3,h4,h5,h6,[role="heading"],[class*="section-title" i],[class*="sectionTitle" i]');
    var found = "";
    for (var i = 0; i < list.length; i++) {
      if (!(list[i].compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)) break;
      if (list[i].contains(el) || !shown(list[i]) || hasControl(list[i])) continue;
      var t = textOf(list[i]);
      if (t && t.length <= 80) found = t;
    }
    return found;
  }
  function sectionIndex(el, section) {
    var counted = /(\d+)\s*$/.exec(section);
    if (counted) return Math.max(+counted[1] - 1, 0);
    var attr = /(?:--|\[|_|-)(\d{1,2})\]?(?:$|[._\-\]])/.exec((el.id || "") + " " + (el.name || ""));
    return attr ? +attr[1] : undefined;
  }

  // ---------- options ----------
  function optionsNow(el) {
    var scope = byIds(el, "aria-controls").concat(byIds(el, "aria-owns"));
    var list = [];
    scope.forEach(function (s) { list = list.concat(Array.prototype.slice.call(s.querySelectorAll('[role="option"]'))); });
    if (!list.length) list = Array.prototype.slice.call(el.getRootNode().querySelectorAll('[role="option"]'));
    if (!list.length && el.getRootNode() !== document) list = Array.prototype.slice.call(document.querySelectorAll('[role="option"]'));
    return list.filter(shown);
  }
  function fieldOptions(f) {
    if (f.type === "select") {
      return Array.prototype.filter.call(f.el.options, function (o) { return !o.disabled && (o.value || o.index > 0); })
        .filter(function (o) { return !/^(select|choose|please select)\b.*$/i.test(line(o.text)) || o.value; })
        .map(function (o) { return { text: line(o.text), checked: o.selected }; });
    }
    if (f.type === "radio" || f.type === "checkbox") {
      return f.members.map(function (m) { return { text: optionText(m), checked: isChecked(m) }; });
    }
    if (f.type === "buttons") return f.members.map(function (m) { return { text: line(m.textContent), checked: m.getAttribute("aria-pressed") === "true" || /selected|active/i.test(m.className) }; });
    return peeked.get(f.el) || [];
  }
  function isChecked(m) { return m.type === "radio" || m.type === "checkbox" ? m.checked : m.getAttribute("aria-checked") === "true"; }

  function key(el, name, code) {
    el.dispatchEvent(new KeyboardEvent("keydown", { key: name, code: name, keyCode: code, which: code, bubbles: true, composed: true, cancelable: true }));
    el.dispatchEvent(new KeyboardEvent("keyup", { key: name, code: name, keyCode: code, which: code, bubbles: true, composed: true, cancelable: true }));
  }
  function press(el) {
    var r = el.getBoundingClientRect();
    var at = { bubbles: true, composed: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0, view: window };
    ["pointerover", "mouseover", "pointerdown"].forEach(function (t) {
      el.dispatchEvent(t.indexOf("pointer") === 0 ? new PointerEvent(t, at) : new MouseEvent(t, at));
    });
    // Like a real click, this only takes focus if the page lets it. Dropdown menus refuse,
    // because losing focus would close them before the click lands.
    if (el.dispatchEvent(new MouseEvent("mousedown", at)) && el.focus) el.focus({ preventScroll: true });
    ["pointerup", "mouseup", "click"].forEach(function (t) {
      el.dispatchEvent(t.indexOf("pointer") === 0 ? new PointerEvent(t, at) : new MouseEvent(t, at));
    });
  }
  async function waitOptions(el, ms) {
    var stop = Date.now() + ms;
    for (;;) {
      var list = optionsNow(el);
      if (list.length || Date.now() > stop) return list;
      await wait(40);
    }
  }
  // A dropdown only has its options while it's open: open it, read them, close it again
  async function peek(f, now) {
    if (!now) {
      await wait(200); // if you clicked it open yourself, leave it open
      if (!current || current.id !== f.id) return null;
    }
    if (f.el.value) return null;
    var open = f.el.getAttribute("aria-expanded") === "true";
    if (f.type === "listbox") { if (!open) press(f.el); }
    else if (!open) { f.el.focus({ preventScroll: true }); key(f.el, "ArrowDown", 40); }
    var list = await waitOptions(f.el, 350);
    var options = list.slice(0, 500).map(function (o) { return { text: line(o.textContent) }; });
    if (!open && f.el.getAttribute("aria-expanded") === "true") {
      if (f.type === "listbox") { key(f.el, "Escape", 27); if (f.el.getAttribute("aria-expanded") === "true") press(f.el); }
      else key(f.el, "Escape", 27);
    }
    return options;
  }

  // ---------- describing a field for the panel ----------
  function comboValue(el) {
    if (el.value) return line(el.value);
    var box = el;
    for (var i = 0; i < 5 && box.parentElement; i++) {
      box = box.parentElement;
      var v = box.querySelector('[class*="single-value" i],[class*="singleValue" i],[class*="multi-value__label" i]');
      if (v) return line(v.textContent);
    }
    return "";
  }
  function valueOf(f) {
    switch (f.type) {
      case "text": case "textarea": return f.el.value || "";
      case "editable": return line(f.el.textContent);
      case "select": {
        var o = f.el.options[f.el.selectedIndex];
        return o && (o.value || o.index > 0) ? line(o.text) : "";
      }
      case "radio": case "checkbox":
        return f.members.filter(isChecked).map(optionText).join(", ");
      case "buttons":
        return fieldOptions(f).filter(function (o) { return o.checked; }).map(function (o) { return o.text; }).join(", ");
      case "combobox": return comboValue(f.el);
      case "listbox": {
        var t = line(f.el.textContent);
        return /^(select|choose)\b/i.test(t) ? "" : t;
      }
    }
    return "";
  }
  function describe(f) {
    var el = f.el;
    var section = headingsBefore(el);
    return {
      id: f.id,
      type: f.type,
      label: labelOf(el, f.members.length > 1 ? f.members : null) || (f.type === "buttons" ? questionFor(f.members) : ""),
      section: section,
      sectionIndex: sectionIndex(el, section),
      name: el.name || "",
      idAttr: el.id || "",
      autocomplete: el.getAttribute("autocomplete") || "",
      placeholder: el.getAttribute("placeholder") || "",
      inputType: el.type || "",
      options: fieldOptions(f),
      multi: f.type === "checkbox" && f.members.length > 1,
      value: valueOf(f)
    };
  }
  function progress() {
    fields = collect();
    var filled = fields.filter(function (f) { return valueOf(f) !== ""; }).length;
    send({ type: "progress", total: fields.length, filled: filled });
  }

  // ---------- which field you're on ----------
  function fieldFor(target) {
    if (!target || target.nodeType !== 1) return null;
    for (var i = 0; i < fields.length; i++) {
      if (fields[i].members.indexOf(target) >= 0) return fields[i];
    }
    return null;
  }
  function fromEvent(e) {
    var path = e.composedPath ? e.composedPath() : [e.target];
    for (var i = 0; i < path.length && i < 8; i++) {
      if (path[i].nodeType !== 1) continue;
      var hit = fieldFor(path[i]);
      if (hit) return hit;
      // a click on a radio's label counts as being on that question
      var inner = path[i].tagName === "LABEL" && path[i].control ? fieldFor(path[i].control) : null;
      if (inner) return inner;
    }
    return null;
  }
  function targetOf(f) {
    var target = f.box || (f.members.length > 1 ? (f.el.closest("fieldset,[role='radiogroup'],[role='group'],ul") || f.el) : f.el);
    if (f.type === "radio" || f.type === "checkbox") {
      if (f.members.length === 1 && f.el.labels && f.el.labels[0]) target = f.el.labels[0];
    }
    if (f.type === "combobox") {
      var box = target;
      for (var i = 0; i < 4 && box.parentElement; i++) {
        box = box.parentElement;
        if (box.getBoundingClientRect().width >= 80) { target = box; break; }
      }
    }
    return target;
  }
  function styleOf(el) {
    return { outline: el.style.getPropertyValue("outline"), priority: el.style.getPropertyPriority("outline"), offset: el.style.getPropertyValue("outline-offset") };
  }
  function restore(el, was) {
    if (was.outline) el.style.setProperty("outline", was.outline, was.priority); else el.style.removeProperty("outline");
    if (was.offset) el.style.setProperty("outline-offset", was.offset); else el.style.removeProperty("outline-offset");
  }
  function mark(f) {
    var target = targetOf(f);
    if (marks.has(target)) return;
    if (lit && lit.el === target) { unlight(); }
    marks.set(target, styleOf(target));
    target.style.setProperty("outline", "2px dashed #1d6a50", "important");
    target.style.setProperty("outline-offset", "2px");
  }
  function unmark(target) {
    var was = marks.get(target);
    marks.delete(target);
    if (lit && lit.el === target) { lit.outline = was.outline; lit.priority = was.priority; lit.offset = was.offset; return; }
    restore(target, was);
  }
  function light(f) {
    unlight();
    var target = targetOf(f);
    lit = Object.assign({ el: target }, styleOf(target));
    target.style.setProperty("outline", "2px solid #1d6a50", "important");
    target.style.setProperty("outline-offset", "2px");
  }
  function unlight() {
    if (!lit) return;
    if (lit.outline) lit.el.style.setProperty("outline", lit.outline, lit.priority); else lit.el.style.removeProperty("outline");
    if (lit.offset) lit.el.style.setProperty("outline-offset", lit.offset); else lit.el.style.removeProperty("outline-offset");
    lit = null;
  }
  function needsPeek(f) { return f.type === "combobox" || f.type === "listbox"; }
  async function setCurrent(f, opts) {
    current = f;
    light(f);
    if (opts && opts.scroll) {
      f.el.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }
    send({ type: "field", field: describe(f) });
    if (needsPeek(f) && !peeked.has(f.el)) {
      var options = await peek(f);
      if (!options) return;
      peeked.set(f.el, options);
      if (current && current.id === f.id) send({ type: "field", field: describe(f), update: true });
    }
  }
  function moveTo(from, dir, onlyEmpty) {
    fields = collect();
    var at = from ? fields.findIndex(function (x) { return x.id === from.id; }) : -1;
    var i = at;
    for (var n = 0; n < fields.length; n++) {
      i += dir;
      if (i < 0 || i >= fields.length) break;
      if (!onlyEmpty || valueOf(fields[i]) === "") return fields[i];
    }
    return null;
  }

  // ---------- putting a value in ----------
  function setNative(el, value) {
    var proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
  }
  function fire(el) {
    el.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    el.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
  }
  function bestLocal(list, want) {
    var w = line(want).toLowerCase();
    var texts = list.map(function (o) { return line(o.textContent).toLowerCase(); });
    var i = texts.indexOf(w);
    if (i < 0) i = texts.findIndex(function (t) { return t.indexOf(w) === 0; });
    if (i < 0) i = texts.findIndex(function (t) { return t.indexOf(w) >= 0; });
    if (i < 0) {
      var parts = w.split(/[^a-z0-9]+/).filter(Boolean);
      var best = 0;
      texts.forEach(function (t, idx) {
        var have = t.split(/[^a-z0-9]+/);
        var n = parts.filter(function (p) { return have.indexOf(p) >= 0; }).length;
        if (n < Math.ceil(parts.length / 2)) return;
        var score = n + (have[0] === parts[0] ? 0.5 : 0); // "New York" before "Nyack, New York"
        if (score > best) { best = score; i = idx; }
      });
    }
    return i >= 0 ? list[i] : null;
  }
  async function typeThenPick(f, text) {
    var el = f.el;
    var attempts = [text];
    var head = line(String(text).split(/,|\s[–—-]\s/)[0]);
    if (head && head !== text) attempts.push(head);
    el.focus({ preventScroll: true });
    for (var a = 0; a < attempts.length; a++) {
      setNative(el, attempts[a]);
      el.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, inputType: "insertText", data: attempts[a] }));
      // Some dropdowns, such as Greenhouse's, only open their list when the key comes back up
      el.dispatchEvent(new KeyboardEvent("keyup", { key: "a", code: "KeyA", keyCode: 65, which: 65, bubbles: true, composed: true }));
      await wait(60);
      var list = await waitOptions(el, 1400);
      var pick = bestLocal(list, attempts[a]);
      if (pick) {
        press(pick);
        await wait(80);
        return { ok: comboValue(el) !== "", reason: "refused" };
      }
      setNative(el, "");
      el.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, inputType: "deleteContentBackward" }));
      await wait(40);
    }
    key(el, "Escape", 27);
    return { ok: false, reason: "no-option" };
  }
  async function pickFromList(f, text) {
    if (f.el.getAttribute("aria-expanded") !== "true") press(f.el);
    var list = await waitOptions(f.el, 1200);
    var pick = bestLocal(list, text);
    if (!pick) { key(f.el, "Escape", 27); return { ok: false, reason: "no-option" }; }
    press(pick);
    await wait(80);
    return { ok: true };
  }
  async function put(f, msg) {
    var el = f.el;
    var value = String(msg.value == null ? "" : msg.value);
    switch (f.type) {
      case "text": case "textarea": {
        el.focus({ preventScroll: true });
        setNative(el, value);
        el.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, inputType: "insertText", data: value }));
        el.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
        await wait(40);
        return { ok: el.value !== "" || value === "", reason: "refused" };
      }
      case "editable": {
        el.focus({ preventScroll: true });
        document.execCommand("selectAll");
        document.execCommand("insertText", false, value);
        return { ok: line(el.textContent) !== "", reason: "refused" };
      }
      case "select": {
        var options = Array.prototype.slice.call(el.options);
        var want = options.find(function (o) { return line(o.text) === line(value); });
        if (!want) return { ok: false, reason: "no-option" };
        el.focus({ preventScroll: true });
        setNative(el, want.value);
        fire(el);
        return { ok: el.selectedIndex === want.index, reason: "refused" };
      }
      case "radio": case "checkbox": case "buttons": {
        var member = f.members.find(function (m) {
          return line(f.type === "buttons" ? m.textContent : optionText(m)) === line(value);
        });
        if (!member) return { ok: false, reason: "no-option" };
        if (f.type === "buttons") press(member);
        else {
          member.click();
          await wait(30);
          if (f.type === "radio" && !isChecked(member)) press((member.labels && member.labels[0]) || member);
        }
        return { ok: true };
      }
      case "combobox": return typeThenPick(f, value);
      case "listbox": return pickFromList(f, value);
    }
    return { ok: false, reason: "refused" };
  }

  // ---------- talking to the panel ----------
  function send(message) {
    if (!port) return;
    try { port.postMessage(message); } catch (e) { stop(); }
  }
  // Every question on the page, with each dropdown's choices read, for filling in one go
  async function scanAll() {
    current = null;
    unlight();
    hush++;
    try {
      fields = collect();
      var out = [];
      for (var i = 0; i < fields.length; i++) {
        var f = fields[i];
        if (needsPeek(f) && !peeked.has(f.el) && valueOf(f) === "") {
          var options = await peek(f, true);
          if (options) peeked.set(f.el, options);
        }
        out.push(describe(f));
      }
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      return out;
    } finally {
      setTimeout(function () { hush--; }, 50);
    }
  }
  // Only for what can be emptied again cleanly
  function clear(f) {
    if (f.type === "text" || f.type === "textarea") {
      setNative(f.el, "");
      f.el.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, inputType: "deleteContentBackward" }));
      f.el.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
      return true;
    }
    if (f.type === "select") {
      var empty = Array.prototype.find.call(f.el.options, function (o) { return !o.value; });
      if (!empty) return false;
      setNative(f.el, "");
      fire(f.el);
      return true;
    }
    return false;
  }

  function stop() {
    port = null;
    current = null;
    unlight();
    Array.from(marks.keys()).forEach(unmark);
    if (watcher) { watcher.disconnect(); watcher = null; }
  }
  function onMessage(msg) {
    if (!msg) return;
    if (msg.type === "fill") {
      fields = collect();
      var f = fields.find(function (x) { return x.id === msg.fieldId; });
      if (!f) return send({ type: "filled", reqId: msg.reqId, ok: false, reason: "gone" });
      if (msg.quiet) hush++;
      put(f, msg).catch(function () { return { ok: false, reason: "refused" }; }).then(function (result) {
        if (msg.quiet) setTimeout(function () { hush--; }, 50);
        send({ type: "filled", reqId: msg.reqId, ok: result.ok, reason: result.reason, fieldId: f.id });
        progress();
        if (msg.quiet) return;
        if (result.ok && msg.advance) {
          var next = moveTo(f, 1, true);
          if (next) setCurrent(next, { scroll: true });
          else send({ type: "end" });
        } else if (result.ok) {
          send({ type: "field", field: describe(f), update: true });
        }
      });
    } else if (msg.type === "scan") {
      scanAll().then(function (list) { send({ type: "scanned", reqId: msg.reqId, fields: list }); });
    } else if (msg.type === "goto") {
      fields = collect();
      var target = fields.find(function (x) { return x.id === msg.fieldId; });
      if (target) setCurrent(target, { scroll: true });
    } else if (msg.type === "clear") {
      fields = collect();
      var c = fields.find(function (x) { return x.id === msg.fieldId; });
      var cleared = !!c && clear(c);
      send({ type: "cleared", reqId: msg.reqId, ok: cleared });
      progress();
    } else if (msg.type === "mark") {
      fields = collect();
      fields.forEach(function (x) { if (msg.fieldIds.indexOf(x.id) >= 0) mark(x); });
    } else if (msg.type === "unmark") {
      fields = collect();
      Array.from(marks.keys()).forEach(function (el) {
        if (!msg.fieldIds) return unmark(el);
        var hit = fields.some(function (x) { return msg.fieldIds.indexOf(x.id) >= 0 && targetOf(x) === el; });
        if (hit) unmark(el);
      });
    } else if (msg.type === "move") {
      if (msg.fieldId == null && current && msg.dir === 0) return setCurrent(current, { scroll: true });
      fields = collect();
      var from = fields.find(function (x) { return x.id === msg.fieldId; }) || null;
      var to = msg.first ? fields.find(function (x) { return valueOf(x) === ""; }) || fields[0] : moveTo(from, msg.dir, false);
      if (to) setCurrent(to, { scroll: true });
      else send({ type: "end" });
    } else if (msg.type === "drop") {
      current = null;
      unlight();
    }
  }
  function connect() {
    if (port) { send({ type: "page", url: location.href, title: document.title }); progress(); return true; }
    var next;
    try { next = chrome.runtime.connect({ name: "callback-fill" }); } catch (e) { return false; }
    port = next;
    next.onDisconnect.addListener(function () { void chrome.runtime.lastError; if (port === next) stop(); });
    next.onMessage.addListener(onMessage);
    send({ type: "page", url: location.href, title: document.title, top: window === window.top });
    progress();
    if (!watcher && document.body) {
      watcher = new MutationObserver(function () {
        clearTimeout(progressTimer);
        progressTimer = setTimeout(function () { if (port) progress(); }, 500);
      });
      watcher.observe(document.body, { childList: true, subtree: true });
    }
    var focused = document.activeElement;
    if (focused && focused !== document.body) {
      var f = fieldFor(focused);
      if (f) setCurrent(f);
    }
    return true;
  }

  function onFocus(e) {
    if (!port || hush) return;
    fields = collect();
    var f = fromEvent(e);
    if (f && (!current || current.id !== f.id)) setCurrent(f);
  }
  document.addEventListener("focusin", onFocus, true);
  document.addEventListener("click", onFocus, true);
  // Something you typed or chose yourself: the panel may offer to remember it
  document.addEventListener("change", function (e) {
    if (!port || !e.isTrusted) return;
    fields = collect();
    var f = fromEvent(e);
    if (!f) return;
    var d = describe(f);
    if (d.value) send({ type: "typed", field: d, value: d.value });
    progress();
  }, true);

  chrome.runtime.onMessage.addListener(function (message, sender, reply) {
    if (message && message.type === "callback-fill-hello") {
      connect();
      reply({ ok: true });
    }
  });
  window.__callbackFill = connect;
  connect();
})();
