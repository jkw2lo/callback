/* The side panel's Fit tab: a report card for the job posting you're on, and its lines marked
   on the page. Built-in analysis runs by itself; Claude's runs only when you ask, and is kept
   so the same posting is never paid for twice. */
(function () {
  "use strict";
  var h = Panel.h;
  var S = Panel.state;
  var view = document.getElementById("fitView");
  var F = {
    status: "idle", // reading, none, noaccess, blocked, ready
    tabId: null, url: "", posting: null, frameId: 0, report: null,
    highlights: true, marked: 0, claudeBusy: false, error: "", settings: {}, jdPorts: [], autoShown: {}
  };
  var VERDICT = {
    strong: { icon: "✓", word: "Fits", cls: "good" },
    partial: { icon: "~", word: "Partly", cls: "partial" },
    gap: { icon: "✕", word: "Gap", cls: "gap" }
  };
  var STATE = { good: "✓", warn: "~", bad: "✕", unknown: "–" };

  function hash(s) { var x = 0; for (var i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) | 0; return String(x); }
  function money(n, cur) {
    var sym = { USD: "$", CAD: "$", GBP: "£", EUR: "€" }[cur || "USD"] || "";
    return sym + (n >= 1000 ? Math.round(n / 1000) + "k" : Math.round(n));
  }

  // ---------- reading the posting ----------
  async function loadSettings() { F.settings = (await chrome.storage.local.get("settings")).settings || {}; }
  function dropMarks() {
    F.jdPorts.forEach(function (p) { try { p.disconnect(); } catch (e) {} });
    F.jdPorts = [];
    F.marked = 0;
  }
  async function read(force) {
    var tabId = S.tabId;
    if (tabId == null) return;
    if (!force && F.tabId === tabId && F.url === S.pageUrl && F.status !== "idle") return;
    F.tabId = tabId; F.url = S.pageUrl; F.error = "";
    dropMarks();
    if (!/^https?:/i.test(S.pageUrl || "")) { F.status = "blocked"; return render(); }
    F.status = "reading";
    render();
    var results;
    try {
      results = await chrome.scripting.executeScript({ target: { tabId: tabId, allFrames: true }, files: ["extract.js"] });
    } catch (e) {
      if (S.tabId === tabId) { F.status = "noaccess"; render(); }
      return;
    }
    if (S.tabId !== tabId) return;
    var best = null;
    (results || []).forEach(function (r) {
      if (r && r.result && (r.result.jd || "").length > ((best && best.result.jd.length) || 0)) best = r;
    });
    if (!best || best.result.jd.length < 200) { F.status = "none"; F.posting = null; return render(); }
    F.posting = Object.assign({}, best.result, { url: S.pageUrl });
    F.frameId = best.frameId || 0;
    await analyze();
    F.status = "ready";
    render();
    highlight();
  }
  async function analyze() {
    var base = Fit.analyze(F.posting, Panel.profile());
    var cache = (await chrome.storage.local.get("fitCache")).fitCache || {};
    var kept = cache[F.posting.url];
    F.report = kept && kept.hash === hash(F.posting.jd) ? Fit.merge(base, kept.ai) : base;
  }
  async function keep(ai) {
    var cache = (await chrome.storage.local.get("fitCache")).fitCache || {};
    cache[F.posting.url] = { hash: hash(F.posting.jd), ai: ai, at: Date.now() };
    var urls = Object.keys(cache).sort(function (a, b) { return cache[b].at - cache[a].at; });
    urls.slice(40).forEach(function (u) { delete cache[u]; }); // the 40 most recent are plenty
    await chrome.storage.local.set({ fitCache: cache });
  }

  // ---------- marks on the page ----------
  async function highlight() {
    if (!F.report) return;
    var target = { tabId: F.tabId, frameIds: [F.frameId] };
    if (!F.highlights) {
      dropMarks();
      render();
      return;
    }
    var lines = F.report.lines.filter(function (l) { return VERDICT[l.verdict]; }).map(function (l) { return { i: l.i, text: l.text, verdict: l.verdict, note: l.note }; });
    try {
      await chrome.scripting.executeScript({ target: target, files: ["jd.js"] });
      var res = await chrome.scripting.executeScript({ target: target, func: function (list) { return window.__callbackJD.mark(list); }, args: [lines] });
      F.marked = (res && res[0] && res[0].result) || 0;
    } catch (e) {
      F.marked = 0;
    }
    render();
  }
  function showLine(i) {
    if (!F.marked) return;
    chrome.scripting.executeScript({ target: { tabId: F.tabId, frameIds: [F.frameId] }, func: function (n) { return window.__callbackJD && window.__callbackJD.show(n); }, args: [i] }).catch(function () {});
  }
  chrome.runtime.onConnect.addListener(function (port) {
    if (port.name !== "callback-jd") return;
    var from = port.sender;
    if (!from || from.id !== chrome.runtime.id || !from.tab || from.tab.id !== F.tabId) { port.disconnect(); return; }
    F.jdPorts.push(port);
    port.onDisconnect.addListener(function () { F.jdPorts = F.jdPorts.filter(function (p) { return p !== port; }); });
  });

  // ---------- Claude ----------
  async function runClaude() {
    if (!F.settings.claudeKey || F.claudeBusy || !F.posting) return;
    F.claudeBusy = true; F.error = "";
    render();
    try {
      var ai = await Fit.askClaude(F.posting, Panel.profile(), F.settings);
      await keep(ai);
      F.report = Fit.merge(Fit.analyze(F.posting, Panel.profile()), ai);
      highlight();
    } catch (e) {
      F.error = e.message;
    }
    F.claudeBusy = false;
    render();
  }

  // ---------- drawing ----------
  function meter(value, cls, label) {
    return h("div", { cls: "meter " + cls, role: "meter", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(value), "aria-label": label },
      h("div", { cls: "meter-fill", style: "width:" + Math.max(2, Math.min(100, value)) + "%" }));
  }
  function verdictLine(state, text) {
    return h("div", { cls: "verdict " + state }, h("span", { cls: "v-icon", "aria-hidden": "true", text: STATE[state] }), h("span", { text: text }));
  }
  function tile(label, value, body, verdict) {
    return h("div", { cls: "tile" }, h("div", { cls: "tile-label", text: label }), value ? h("div", { cls: "tile-value", text: value }) : null, body, verdict);
  }
  function payTile(r) {
    if (!r.pay) return tile("Pay", "Not listed", null, verdictLine("unknown", r.payVerdict.text === "Not listed" ? "The posting doesn't say" : r.payVerdict.text));
    var cur = r.pay.currency;
    var low = r.pay.low, high = r.pay.high, pmin = r.prefs.payMin, pmax = r.prefs.payMax || (pmin ? pmin * 1.3 : 0);
    var from = Math.min(low, pmin || low) * 0.85, to = Math.max(high, pmax || high) * 1.1;
    var x = function (n) { return ((n - from) / (to - from) * 100).toFixed(1) + "%"; };
    var bar = h("div", { cls: "range", title: "This job " + money(low, cur) + "–" + money(high, cur) + (pmin ? "; your range " + money(pmin, cur) + (r.prefs.payMax ? "–" + money(r.prefs.payMax, cur) : "+") : "") });
    if (pmin) bar.append(h("div", { cls: "range-yours", style: "left:" + x(pmin) + ";width:calc(" + x(pmax) + " - " + x(pmin) + ")" }));
    bar.append(h("div", { cls: "range-job", style: "left:" + x(low) + ";width:calc(" + x(high) + " - " + x(low) + ")" }));
    var key = h("div", { cls: "range-key" }, h("span", {}, h("i", { cls: "k-job" }), "This job"), pmin ? h("span", {}, h("i", { cls: "k-yours" }), "Your range") : null);
    var verdictState = { good: "good", warn: "warn", bad: "bad", unknown: "unknown" }[r.payVerdict.state];
    return tile("Pay", money(low, cur) + "–" + money(high, cur) + (r.pay.hourly ? " (from hourly)" : ""), h("div", {}, bar, key), verdictLine(verdictState, r.payVerdict.text));
  }
  function levelTile(r) {
    var scale = h("div", { cls: "scale", role: "img", "aria-label": "This job: " + Fit.LEVELS[r.level.job - 1] + ". You: " + Fit.LEVELS[r.level.you - 1] });
    Fit.LEVELS.forEach(function (name, i) {
      var n = i + 1;
      scale.append(h("div", { cls: "step" + (n === r.level.job ? " job" : "") + (n === r.level.you ? " you" : ""), title: name },
        h("span", { cls: "step-bar" }), h("span", { cls: "step-you", text: n === r.level.you ? "You" : "" })));
    });
    var gap = r.level.gap;
    var verdict = gap >= 2 ? verdictLine("bad", "A big stretch from where you are") : gap === 1 ? verdictLine("warn", "A step up") : gap === 0 ? verdictLine("good", "Your level") : verdictLine("warn", "Below your level");
    return tile("Level", Fit.LEVELS[r.level.job - 1], scale, r.years.asked ? h("div", {}, verdict, h("div", { cls: "tile-note", text: "Asks " + r.years.asked + "+ years; you have about " + r.years.yours + "." })) : verdict);
  }
  function techTile(r) {
    return tile("How technical", Fit.technicalLabel(r.technical), meter(r.technical, "neutral", "How technical: " + r.technical + " of 100"), h("div", { cls: "tile-note", text: r.technical + " of 100" }));
  }
  function placeTile(r) {
    return tile("Location", r.place.label, null, verdictLine(r.place.state, r.place.text));
  }
  function lineRow(l) {
    var v = VERDICT[l.verdict];
    return h("button", { cls: "line " + v.cls, type: "button", onclick: function () { showLine(l.i); }, title: F.marked ? "Show it on the page" : "" },
      h("span", { cls: "v-icon", "aria-label": v.word, text: v.icon }),
      h("span", { cls: "line-body" }, h("span", { cls: "line-text", text: l.text.replace(/^[•\-–*\s]+/, "") }), l.note ? h("span", { cls: "line-note", text: l.note }) : null));
  }
  function group(title, list, open, id) {
    if (!list.length) return null;
    var d = h("details", { cls: "lines-group", id: id }, h("summary", { text: title + " (" + list.length + ")" }), h("div", { cls: "lines" }, ...list.map(lineRow)));
    d.open = open;
    return d;
  }
  function report(r) {
    var box = document.createDocumentFragment();
    var fitCls = r.fit == null ? "neutral" : r.fit >= 70 ? "good" : r.fit >= 45 ? "partial" : "gap";
    var counts = { strong: 0, partial: 0, gap: 0 };
    r.lines.forEach(function (l) { if (counts[l.verdict] != null) counts[l.verdict]++; });
    var source = r.source === "claude"
      ? "Claude's reading (" + (Fit.MODELS[r.model] ? Fit.MODELS[r.model].name.replace("Claude ", "") : r.model) + (r.cost ? ", " + Fit.money(r.cost) : "") + ")"
      : "Built-in estimate";

    box.append(h("div", { cls: "card report", id: "reportCard" },
      h("div", { cls: "rp-head" },
        h("div", { cls: "rp-title", text: r.posting.title || "This job" }),
        h("div", { cls: "small muted", text: [r.posting.company, source].filter(Boolean).join(" · ") })),
      h("div", { cls: "rp-hero" },
        h("div", { cls: "hero-wrap" }, h("span", { cls: "hero", id: "fitScore", text: r.fit == null ? "–" : r.fit + "%" }), h("span", { cls: "hero-label", text: "fit" })),
        h("div", { cls: "tile callback" }, h("div", { cls: "tile-label", text: "Callback chance" }),
          h("div", { cls: "tile-value", id: "callbackChance", text: r.callback ? r.callback.charAt(0).toUpperCase() + r.callback.slice(1) : "–" }))),
      r.fit == null ? null : meter(r.fit, fitCls, "Fit: " + r.fit + " of 100"),
      h("p", { cls: "small muted rp-note", text: r.summary || r.callbackWhy || (r.source === "claude" ? "" : "From the requirements your saved experience covers. The callback chance is a rough guess from fit and level, not a prediction.") }),
      r.source === "claude" && r.summary && r.callbackWhy ? h("p", { cls: "small muted rp-note", text: r.callbackWhy }) : null,
      h("div", { cls: "rp-grid" }, payTile(r), levelTile(r), techTile(r), placeTile(r))));

    var gaps = r.lines.filter(function (l) { return l.verdict === "gap"; });
    var partly = r.lines.filter(function (l) { return l.verdict === "partial"; });
    var fits = r.lines.filter(function (l) { return l.verdict === "strong"; });
    var toggle = h("input", { type: "checkbox", id: "markToggle", onchange: function (e) { F.highlights = e.target.checked; highlight(); } });
    toggle.checked = F.highlights;
    box.append(h("div", { cls: "card", id: "linesCard" },
      h("h2", { text: "Line by line" }),
      h("div", { cls: "legend" },
        h("span", { cls: "chip good" }, h("span", { cls: "v-icon", text: "✓" }), counts.strong + " fit"),
        h("span", { cls: "chip partial" }, h("span", { cls: "v-icon", text: "~" }), counts.partial + " partly"),
        h("span", { cls: "chip gap" }, h("span", { cls: "v-icon", text: "✕" }), counts.gap + " gaps")),
      h("label", { cls: "check small" }, toggle, h("span", { text: F.highlights ? (F.marked ? "Marked " + F.marked + " lines on the page" : "Marking lines on the page…") : "Mark lines on the page" })),
      group("Gaps", gaps, true, "gapLines"), group("Partly there", partly, true, "partialLines"), group("Fits", fits, false, "fitLines"),
      !gaps.length && !partly.length && !fits.length ? h("p", { cls: "none", text: "No requirement lines found. Highlight the description on the page and press Refresh." }) : null));

    box.append(claudeCard(r));
    return box;
  }
  function claudeCard(r) {
    var card = h("div", { cls: "card", id: "claudeCard" });
    var model = Fit.MODELS[F.settings.claudeModel] ? F.settings.claudeModel : Fit.DEFAULT_MODEL;
    if (F.error) card.append(h("div", { cls: "note warn", role: "status", text: F.error }));
    if (!F.settings.claudeKey) {
      card.append(h("h2", { text: "A closer read" }),
        h("p", { cls: "small muted", text: "The built-in estimate matches words. Claude reads each line for meaning, so related experience counts. It needs your own Claude API key." }),
        h("div", { cls: "row" }, h("button", { cls: "btn", type: "button", id: "addKey", text: "Add a key in My info", onclick: function () { Panel.showView("info"); var d = document.querySelector('details[data-part="claude"]'); if (d) { d.open = true; d.scrollIntoView(); } } })));
      return card;
    }
    if (F.claudeBusy) {
      card.append(h("h2", { text: "Claude is reading the posting…" }), h("p", { cls: "small muted", text: "This usually takes under a minute." }));
      return card;
    }
    card.append(h("h2", { text: r.source === "claude" ? "Claude's reading" : "A closer read" }),
      h("p", { cls: "small muted", text: "Sends this description, your work history, education, skills and summary to Anthropic. Never your contact details or self-ID answers." }),
      h("div", { cls: "row" }, h("button", { cls: "btn" + (r.source === "claude" ? "" : " solid"), type: "button", id: "runClaude", onclick: runClaude,
        text: (r.source === "claude" ? "Run it again" : "Analyze with Claude") + " (about " + Fit.money(Fit.estimate(model)) + ")" })));
    return card;
  }
  function render() {
    if (S.view !== "fit") return;
    view.textContent = "";
    var p = Panel.profile();
    if (!p.jobs.length) {
      view.append(h("div", { cls: "card" }, h("h2", { text: "Add your work history first" }),
        h("p", { cls: "muted", text: "Fit compares a posting with your experience. Import your resume or add your jobs in My info." }),
        h("div", { cls: "row" }, h("button", { cls: "btn solid", type: "button", text: "Go to My info", onclick: function () { Panel.showView("info"); } }))));
      return;
    }
    if (F.status === "idle" || F.status === "reading") { view.append(h("p", { cls: "muted", text: "Reading the job description…" })); return; }
    if (F.status === "blocked") { view.append(h("div", { cls: "card" }, h("h2", { text: "Nothing to read here" }), h("p", { cls: "muted", text: "Open a job posting." }))); return; }
    if (F.status === "noaccess") {
      var host = ""; try { host = new URL(S.pageUrl).hostname; } catch (e) {}
      view.append(h("div", { cls: "card", id: "fitNoAccess" }, h("h2", { text: "Callback can't read this page yet" }),
        h("p", { cls: "muted", text: "Click the Callback toolbar icon on this page, or turn it on for the site." }),
        h("div", { cls: "row" }, h("button", { cls: "btn solid", type: "button", text: "Turn on for " + host, onclick: function () { Panel.turnOnSite().then(function () { read(true); }); } }))));
      return;
    }
    if (F.status === "none") {
      view.append(h("div", { cls: "card", id: "noJd" }, h("h2", { text: "No job description found" }),
        h("p", { cls: "muted", text: "Open a posting. If the description is there but missed, highlight it on the page and press Refresh." }),
        h("div", { cls: "row" }, h("button", { cls: "btn", type: "button", text: "Refresh", onclick: function () { read(true); } }))));
      return;
    }
    view.append(report(F.report));
    view.append(h("div", { cls: "row fit-foot" }, h("button", { cls: "btn ghost", type: "button", id: "refreshFit", text: "Refresh", onclick: function () { read(true); } }),
      h("span", { cls: "small muted", text: "Highlight part of the page first to judge just that part." })));
  }

  // ---------- following the tab ----------
  var timer = 0;
  window.addEventListener("callback-tab", function () {
    clearTimeout(timer);
    timer = setTimeout(function () {
      if (S.view === "fit") return read(false);
      // A posting with no form: open on its report card, once per page
      if (S.view === "fill" && !S.field && !S.review && Panel.formFields() === 0 && !F.autoShown[S.pageUrl] && Panel.profile().jobs.length) {
        F.autoShown[S.pageUrl] = true;
        read(false).then(function () {
          if (F.status === "ready" && S.view === "fill" && Panel.formFields() === 0 && !S.field) Panel.showView("fit");
        });
      }
    }, 900);
  });
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== "local") return;
    if (changes.settings) { F.settings = changes.settings.newValue || {}; render(); }
    if (changes.profile && F.posting) analyze().then(function () { render(); highlight(); });
  });

  window.FitPanel = {
    state: F,
    render: function () { render(); read(false); },
    refresh: function () { return read(true); }
  };
  loadSettings();
})();
