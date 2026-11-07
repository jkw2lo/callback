/* The side panel's Fill tab. It shows what the field you're on is asking and your saved info that
   fits, ranked. One click (or Enter) puts that value in and moves to the next empty field.

   Everything read from a page is treated as plain text: nothing here uses it as HTML. */
(function () {
  "use strict";

  var params = new URLSearchParams(location.search);
  var pinnedTab = params.has("tab") ? Number(params.get("tab")) : null; // for opening in a tab, as the tests do

  var S = {
    windowId: null, tabId: null, pageUrl: "", access: "checking",
    ports: new Map(), frames: new Map(),
    field: null, frameId: null, atEnd: false,
    profile: Profile.blank(), jobs: [], chosenJob: new Map(),
    picks: {}, remember: null, note: null, query: "", view: "fill",
    reqId: 0, pending: new Map(), result: null
  };

  var view = document.getElementById("fillView");
  var COPY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z"/></svg>';

  function h(tag, props) {
    var el = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      if (k === "text") el.textContent = props[k];
      else if (k === "html") el.innerHTML = props[k]; // only ever a constant from this file
      else if (k.indexOf("on") === 0) el.addEventListener(k.slice(2), props[k]);
      else if (props[k] !== undefined && props[k] !== false) el.setAttribute(k === "cls" ? "class" : k, props[k]);
    });
    for (var i = 2; i < arguments.length; i++) {
      if (arguments[i] == null || arguments[i] === false) continue;
      el.append(arguments[i]);
    }
    return el;
  }

  // ---------- connecting to the tab ----------
  function dropPorts() {
    S.ports.forEach(function (p) { try { p.disconnect(); } catch (e) {} });
    S.ports.clear();
    S.frames.clear();
  }
  async function attach(tabId) {
    dropPorts();
    S.tabId = tabId;
    S.field = null;
    S.atEnd = false;
    S.result = null;
    S.access = "checking";
    render();
    var tab;
    try { tab = await chrome.tabs.get(tabId); } catch (e) { S.access = "blocked"; return render(); }
    S.pageUrl = tab.url || "";
    if (!/^https?:/i.test(S.pageUrl) || /^https:\/\/chromewebstore\.google\.com/.test(S.pageUrl)) { S.access = "blocked"; return render(); }
    try {
      await chrome.tabs.sendMessage(tabId, { type: "callback-fill-hello" });
      S.access = "ok";
    } catch (e) {
      try {
        await chrome.scripting.executeScript({ target: { tabId: tabId, allFrames: true }, files: ["fill.js"] });
        S.access = "ok";
      } catch (e2) {
        S.access = "none";
      }
    }
    if (S.tabId === tabId) render();
  }
  async function turnOnSite() {
    var origin = new URL(S.pageUrl).origin;
    var pattern = origin + "/*";
    var ok = await chrome.permissions.request({ origins: [pattern] }); // has to come first, from your click
    if (!ok) return;
    try {
      await chrome.scripting.registerContentScripts([{ id: "site-" + origin, matches: [pattern], js: ["fill.js"], allFrames: true, runAt: "document_idle" }]);
    } catch (e) {} // already registered
    attach(S.tabId);
  }

  chrome.runtime.onConnect.addListener(function (port) {
    if (port.name !== "callback-fill") return;
    var from = port.sender;
    if (!from || from.id !== chrome.runtime.id || !from.tab || from.tab.id !== S.tabId) { port.disconnect(); return; }
    var frameId = from.frameId || 0;
    S.ports.set(frameId, port);
    S.access = "ok";
    port.onMessage.addListener(function (m) { onFrame(frameId, m); });
    port.onDisconnect.addListener(function () {
      void chrome.runtime.lastError;
      if (S.ports.get(frameId) === port) S.ports.delete(frameId);
      S.frames.delete(frameId);
      if (S.frameId === frameId) { S.field = null; render(); }
    });
    render();
  });

  function bestFrame() {
    var best = null, most = 0;
    S.frames.forEach(function (info, id) { if ((info.total || 0) > most) { most = info.total; best = id; } });
    return best;
  }
  function totals() {
    var id = S.field ? S.frameId : bestFrame();
    return (id != null && S.frames.get(id)) || { total: 0, filled: 0 };
  }

  function onFrame(frameId, m) {
    if (m.type === "page") {
      var info = S.frames.get(frameId) || {};
      info.url = m.url;
      S.frames.set(frameId, info);
      if (m.top) S.pageUrl = m.url;
      renderJob();
    } else if (m.type === "progress") {
      var was = totals().total;
      var entry = S.frames.get(frameId) || {};
      entry.total = m.total; entry.filled = m.filled;
      S.frames.set(frameId, entry);
      if (!S.field && was !== totals().total) render(); else renderCount();
    } else if (m.type === "field") {
      var sameField = S.field && S.field.id === m.field.id && S.frameId === frameId;
      S.field = m.field;
      S.frameId = frameId;
      S.atEnd = false;
      if (!m.update && !sameField) {
        S.query = "";
        if (S.remember && ++S.remember.age > 1) S.remember = null;
        if (S.result && ++S.result.age > 1) S.result = null;
      }
      render();
      focusTop();
    } else if (m.type === "end") {
      S.field = null;
      S.atEnd = true;
      if (S.remember && ++S.remember.age > 1) S.remember = null;
      render();
    } else if (m.type === "filled") {
      var pick = S.pending.get(m.reqId);
      S.pending.delete(m.reqId);
      if (pick && !m.ok) failed(pick, m.reason);
    } else if (m.type === "typed") {
      offerRemember(m.field, m.value);
    }
  }

  // ---------- picking ----------
  function context() { return { job: currentJob(), picks: S.picks }; }
  function isJobish(key) { return /^(job|edu)\./.test(key || ""); }

  function choose(pick, how) {
    var f = S.field;
    var port = f && S.ports.get(S.frameId);
    if (!port) return;
    var id = ++S.reqId;
    S.pending.set(id, pick);
    port.postMessage({ type: "fill", reqId: id, fieldId: f.id, value: pick.value, advance: !f.multi });

    if (isJobish(pick.key)) S.picks[Match.norm(f.section)] = Number(pick.key.split(".")[1]);
    if (pick.key && how === "picked") {
      S.profile.learned[Match.norm(f.label)] = pick.key;
      saveProfile();
    }
    if (how === "option") offerRemember(f, pick.value);
  }
  function failed(pick, reason) {
    copy(pick.value);
    S.result = {
      age: 0,
      text: reason === "no-option"
        ? "That isn't one of this field's choices, so it's on your clipboard. Type or paste it in, then pick from its list."
        : reason === "gone"
          ? "That field has gone from the page. Your value is on the clipboard."
          : "This field wouldn't take it, so it's on your clipboard. Click the field and paste."
    };
    render();
  }
  function copy(text) {
    if (navigator.clipboard) navigator.clipboard.writeText(text).catch(function () {});
  }
  function move(dir) {
    var port = S.ports.get(S.frameId != null && S.ports.has(S.frameId) ? S.frameId : bestFrame());
    if (!port) return;
    port.postMessage({ type: "move", dir: dir, fieldId: S.field ? S.field.id : null });
  }
  function start() {
    var id = bestFrame();
    var port = id != null && S.ports.get(id);
    if (port) port.postMessage({ type: "move", first: true, dir: 1 });
  }
  function focusTop() {
    if (!document.hasFocus() || S.view !== "fill") return;
    var active = document.activeElement;
    if (active && active.classList && active.classList.contains("search") && S.query) return;
    var top = view.querySelector(".pick-main");
    if (top) top.focus({ preventScroll: true });
  }

  // ---------- remembering what you answered ----------
  function offerRemember(field, value) {
    if (!value || (field.type === "checkbox" && field.options.length < 2)) return;
    var known = Match.suggest(field, S.profile, context()).suggestions.some(function (s) { return Match.norm(s.value) === Match.norm(value); });
    if (known || S.pending.size > 1) return;
    S.remember = { field: field, value: value, age: 0 };
    render();
  }
  function saveRemember() {
    var r = S.remember;
    if (!r) return;
    var p = S.profile;
    var kinds = Match.classify(r.field).map(function (k) { return k.kind; });
    var kind = kinds[0];
    var choice = kind && Match.CHOICES[kind] ? Match.choiceOf(kind, r.value) : "";
    if (choice) p.answers[kind] = choice;
    else if (kind && Profile.BASICS.indexOf(kind) >= 0 && !p.basics[kind]) p.basics[kind] = r.value;
    else if (kind && Profile.TEXTS.indexOf(kind) >= 0 && !p.texts[kind]) p.texts[kind] = r.value;
    else {
      var q = r.field.label || "Answer";
      var same = p.saved.filter(function (s) { return Match.norm(s.q) === Match.norm(q); })[0];
      if (same) same.a = r.value.slice(0, 5000);
      else p.saved.push({ q: q, a: r.value.slice(0, 5000) });
    }
    S.remember = null;
    saveProfile();
    render();
  }

  // ---------- the job this application is for ----------
  function currentJob() {
    var chosen = S.chosenJob.get(S.tabId);
    if (chosen === "") return null;
    if (chosen) return S.jobs.filter(function (j) { return j.tag === chosen; })[0] || null;
    return Match.jobForPage(S.pageUrl, S.jobs);
  }
  function jobName(j) { return [j.company, j.title].filter(Boolean).join(", ") || "Untitled job"; }
  function jobBar() {
    var job = currentJob();
    var options = S.jobs.filter(function (j) { return j.stage !== "closed"; })
      .sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); }).slice(0, 40);
    var select = h("select", {
      "aria-label": "Which job this application is for",
      onchange: function (e) { S.chosenJob.set(S.tabId, e.target.value); render(); }
    }, h("option", { value: "", text: job || options.length ? "None of these" : "No jobs on your board yet" }));
    options.forEach(function (j) { select.append(h("option", { value: j.tag, text: jobName(j) })); });
    select.value = job ? job.tag : "";
    return h("div", { cls: "job", id: "jobBar" },
      h("span", { cls: "small muted", text: job ? "Applying to" : "Not matched to a job on your board" }),
      options.length ? select : null,
      job ? null : h("div", { cls: "row" },
        h("button", { cls: "btn", type: "button", id: "addJob", text: "Add this job", onclick: addJob }),
        h("span", { cls: "small muted", text: "for a tracked portfolio link" })));
  }
  function addJob() {
    chrome.runtime.sendMessage({ type: "capture-tab", tabId: S.tabId });
  }

  // ---------- drawing ----------
  function pickRow(pick, opts) {
    var main = h("button", {
      cls: "pick-main", type: "button",
      onclick: function () { choose(pick, opts.how); }
    }, h("span", { cls: "pick-value", text: pick.value }), pick.label ? h("span", { cls: "pick-from", text: pick.label }) : null);
    return h("div", { cls: "pick" + (opts.top ? " top" : "") + (pick.checked ? " on" : "") }, main,
      opts.copy === false ? null : h("button", {
        cls: "pick-copy", type: "button", title: "Copy", "aria-label": "Copy " + pick.value, html: COPY_ICON,
        onclick: function () { copy(pick.value); }
      }));
  }
  function questionHead(f) {
    return h("div", { cls: "question" },
      f.section ? h("div", { cls: "sec", text: f.section }) : null,
      h("div", { cls: "q", id: "fieldLabel", text: f.label || f.placeholder || "This field" }),
      f.value ? h("div", { cls: "current", text: "Now: " + f.value.slice(0, 120) }) : null);
  }
  function fieldBody(f) {
    var box = h("div", { id: "suggestions" });
    var found = Match.suggest(f, S.profile, context());
    var title = found.unset ? Match.CHOICES[found.unset].title : "";
    if (found.suggestions.length) {
      var list = h("div", { cls: "picks" });
      found.suggestions.forEach(function (s, i) {
        var isOption = s.option != null;
        list.append(pickRow({ value: s.value, label: s.label, key: s.key }, { top: i === 0, how: i === 0 ? "top" : "picked", copy: !isOption }));
      });
      box.append(list);
    } else if (!found.others.length) {
      box.append(h("p", { cls: "none", text: "Nothing saved fits this one. Type your answer on the page and Callback can remember it." }));
    }
    if (found.others.length) {
      if (found.unset && !found.suggestions.length) box.append(h("p", { cls: "small muted", text: "No saved answer for “" + title + "”. Pick one and you can save it." }));
      box.append(h("div", { cls: "divider", text: found.suggestions.length ? "This form's other choices" : "This form's choices" }));
      var others = h("div", { cls: "picks" });
      found.others.slice(0, 60).forEach(function (o) {
        others.append(pickRow({ value: o.value, checked: o.checked }, { how: "option", copy: false }));
      });
      box.append(others);
      if (found.others.length > 60) box.append(h("p", { cls: "small muted", text: "Plus " + (found.others.length - 60) + " more. Search the list on the page." }));
    }
    return box;
  }
  function searchBox() {
    var results = h("div", { id: "searchResults", cls: "picks" });
    function draw() {
      results.textContent = "";
      Match.search(S.query, S.profile, context()).forEach(function (it) {
        var value = it.date ? Match.formatDate(it.value, S.field || {}).text : it.value;
        results.append(pickRow({ value: value, label: it.label, key: it.key }, { how: "picked" }));
      });
      if (results.childElementCount) results.style.marginTop = "6px";
    }
    var input = h("input", {
      cls: "search", type: "search", placeholder: "Search all my info", "aria-label": "Search all my info", value: S.query,
      oninput: function (e) { S.query = e.target.value; draw(); }
    });
    var wrap = h("div", {}, input, results);
    if (S.query) draw();
    return wrap;
  }
  function renderCount() {
    var el = document.getElementById("fieldCount");
    if (!el) return;
    var t = totals();
    el.textContent = t.total ? t.filled + " of " + t.total + " filled" : "";
  }
  function renderJob() {
    var old = document.getElementById("jobBar");
    if (old) old.replaceWith(jobBar());
  }
  function notes() {
    var box = document.createDocumentFragment();
    if (S.result) box.append(h("div", { cls: "note warn", role: "status", text: S.result.text }));
    if (S.remember) {
      var r = S.remember;
      box.append(h("div", { cls: "note", id: "rememberNote" },
        h("div", { text: "Save “" + r.value.slice(0, 80) + (r.value.length > 80 ? "…" : "") + "” for questions like “" + (r.field.label || "this").slice(0, 80) + "”?" }),
        h("div", { cls: "row" },
          h("button", { cls: "btn", type: "button", id: "rememberYes", text: "Save", onclick: saveRemember }),
          h("button", { cls: "btn ghost", type: "button", text: "Not now", onclick: function () { S.remember = null; render(); } }))));
    }
    return box;
  }
  function render() {
    if (S.view !== "fill") return;
    var keepSearch = document.activeElement && document.activeElement.classList && document.activeElement.classList.contains("search");
    view.textContent = "";

    if (Profile.isEmpty(S.profile)) {
      view.append(h("div", { cls: "card" },
        h("h2", { text: "Add your info first" }),
        h("p", { cls: "muted", text: "Callback suggests answers from what you save here. It stays in this browser." }),
        h("div", { cls: "row" }, h("button", { cls: "btn solid", type: "button", text: "Add my info", onclick: function () { showView("info"); } }))));
      return;
    }
    if (S.access === "checking") { view.append(h("p", { cls: "muted", text: "Looking at this page…" })); return; }
    if (S.access === "blocked") {
      view.append(h("div", { cls: "card" }, h("h2", { text: "Nothing to fill here" }), h("p", { cls: "muted", text: "Open a job application form and click a field." })));
      return;
    }
    if (S.access === "none") {
      var host = "";
      try { host = new URL(S.pageUrl).hostname; } catch (e) {}
      view.append(h("div", { cls: "card", id: "turnOnCard" },
        h("h2", { text: "Callback can't see this page yet" }),
        h("p", { cls: "muted", text: "It only reads known job portals and sites you turn on." }),
        h("div", { cls: "row" }, h("button", { cls: "btn solid", type: "button", id: "turnOn", text: "Turn on for " + host, onclick: turnOnSite }))));
      return;
    }

    view.append(notes());
    view.append(jobBar());

    if (S.field) {
      var f = S.field;
      view.append(h("div", { cls: "card", id: "fieldCard" }, questionHead(f), fieldBody(f), searchBox()));
    } else if (S.atEnd) {
      view.append(h("div", { cls: "card", id: "endCard" },
        h("h2", { text: "No more empty fields here" }),
        h("p", { cls: "muted", text: "Look it over, attach your resume and submit it yourself. If there's another page, click its first field." })));
    } else if (totals().total) {
      view.append(h("div", { cls: "card", id: "startCard" },
        h("h2", { text: "Click a field on the form" }),
        h("p", { cls: "muted", text: "Your matching info shows up here. Click one, or press Enter, to fill it and move on." }),
        h("div", { cls: "row" }, h("button", { cls: "btn solid", type: "button", id: "startBtn", text: "Start at the first empty field", onclick: start }))));
    } else {
      view.append(h("div", { cls: "card", id: "noFormCard" },
        h("h2", { text: "No form on this page" }),
        h("p", { cls: "muted", text: "Open the application form. Many postings have an Apply button first." })));
    }

    view.append(h("div", { cls: "nav" },
      h("button", { cls: "btn ghost", type: "button", id: "backBtn", text: "Back", disabled: !S.field, onclick: function () { move(-1); } }),
      h("span", { cls: "count", id: "fieldCount", role: "status" }),
      h("button", { cls: "btn ghost", type: "button", id: "nextBtn", text: "Next", disabled: !S.field, onclick: function () { move(1); } })));
    renderCount();
    if (keepSearch) {
      var again = view.querySelector(".search");
      if (again) again.focus();
    }
  }
  function showView(which) {
    S.view = which;
    document.getElementById("tabFill").setAttribute("aria-selected", which === "fill");
    document.getElementById("tabInfo").setAttribute("aria-selected", which === "info");
    view.hidden = which !== "fill";
    document.getElementById("infoView").hidden = which !== "info";
    if (which === "fill") render();
    else if (window.Info) window.Info.render();
  }

  // ---------- saving ----------
  var PANEL_ID = String(Math.random());
  var saveTimer = 0;
  function saveProfile() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { saveTimer = 0; Profile.save(S.profile, PANEL_ID); }, 150);
  }
  // Closing the panel right after typing
  window.addEventListener("pagehide", function () {
    if (saveTimer) { clearTimeout(saveTimer); Profile.save(S.profile, PANEL_ID); }
  });

  // ---------- start ----------
  document.getElementById("tabFill").addEventListener("click", function () { showView("fill"); });
  document.getElementById("tabInfo").addEventListener("click", function () { showView("info"); });
  // Up and down walk the suggestions, as Enter on one fills it
  view.addEventListener("keydown", function (e) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    var all = Array.prototype.slice.call(view.querySelectorAll(".pick-main"));
    var at = all.indexOf(document.activeElement);
    if (!all.length) return;
    e.preventDefault();
    var next = e.key === "ArrowDown" ? Math.min(at + 1, all.length - 1) : Math.max(at - 1, 0);
    all[next].focus();
  });

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== "local") return;
    if (changes.boardJobs) { S.jobs = changes.boardJobs.newValue || []; render(); }
    // Our own saves come back here too, older than what's being typed by then: only take others'
    var next = changes.profile && changes.profile.newValue;
    if (next && next.writer !== PANEL_ID) {
      S.profile = Profile.normalize(next);
      if (S.view === "info") window.Info.render();
      else render();
    }
  });
  chrome.tabs.onActivated.addListener(function (info) {
    if (pinnedTab == null && info.windowId === S.windowId) attach(info.tabId);
  });
  chrome.tabs.onUpdated.addListener(function (tabId, change) {
    if (tabId !== S.tabId) return;
    if (change.url) { S.pageUrl = change.url; renderJob(); }
    if (change.status === "complete" && !S.ports.size) attach(tabId);
  });

  window.Panel = {
    h: h,
    state: S,
    profile: function () { return S.profile; },
    replaceProfile: function (p) { S.profile = p; Profile.save(p, PANEL_ID); },
    saveProfile: saveProfile,
    showView: showView
  };

  (async function () {
    var got = await Promise.all([Profile.load(), chrome.storage.local.get("boardJobs")]);
    S.profile = got[0];
    S.jobs = got[1].boardJobs || [];
    showView("fill");
    if (pinnedTab != null) return attach(pinnedTab);
    var win = await chrome.windows.getCurrent();
    S.windowId = win.id;
    var tabs = await chrome.tabs.query({ active: true, windowId: win.id });
    if (tabs[0]) attach(tabs[0].id);
  })();
})();
