/* =========================================================
   Callback: the board, the job form and the settings
   ========================================================= */
(function () {
  "use strict";

  var PORTFOLIO = "https://jkw2lo.github.io/projects/";
  var $ = function (id) { return document.getElementById(id); };
  var board = $("board"), tabs = $("tabs"), form = $("jobForm"), jobDialog = $("jobDialog"), menuDialog = $("menuDialog");
  var FIELDS = ["company", "title", "location", "pay", "url", "stage", "followUp", "resume", "notes", "jd"];

  var activeStage = "saved"; // which column a phone shows
  var query = "";
  var current = null;        // the job open in the form, or null while adding a new one
  var pendingDrafts = [];    // captured from the extension while another new job is still unsaved
  var saveTimer = null, noteTimer = null;
  var extensionSeen = false;

  // ---------- helpers ----------
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function safeUrl(u) {
    try { var url = new URL(u); return /^https?:$/.test(url.protocol) ? url.href : ""; } catch (e) { return ""; }
  }
  function dateFromInput(s) { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function startOfToday() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  function shortDate(d) { return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
  function when(t) {
    if (!t) return "";
    var days = Math.floor((startOfToday() - new Date(t).setHours(0, 0, 0, 0)) / 864e5);
    return days <= 0 ? "today" : days === 1 ? "yesterday" : shortDate(new Date(t));
  }
  function times(n) { return n === 1 ? "once" : n + " times"; }
  function linksFor(job) {
    var home = PORTFOLIO + "?for=" + job.tag;
    return { home: home, resume: home + "#resume" };
  }
  function viewedLine(v) {
    var parts = [];
    if (v.pf) parts.push("Portfolio opened " + times(v.pf));
    if (v.rv) parts.push("resume viewed " + times(v.rv));
    if (v.rd) parts.push("resume downloaded " + times(v.rd));
    var line = parts.join(", ");
    return line.charAt(0).toUpperCase() + line.slice(1) + ". Last " + when(v.last) + ".";
  }
  function isDue(job) {
    return !!job.followUp && job.stage !== "closed" && dateFromInput(job.followUp) <= startOfToday();
  }
  function matches(job) {
    if (!query) return true;
    return [job.company, job.title, job.location, job.notes, job.jd].join("\n").toLowerCase().indexOf(query) >= 0;
  }

  // ---------- the board ----------
  function cardHtml(job) {
    var v = Sync.viewsFor(job.tag), bits = "";
    if (v && (v.pf || v.rv || v.rd)) {
      var short = [];
      if (v.pf) short.push("Opened " + v.pf + "×");
      if (v.rv) short.push("resume " + v.rv + "×");
      if (v.rd) short.push("downloaded " + v.rd + "×");
      bits += '<span class="signal">' + esc(short.join(", ")) + " · " + esc(when(v.last)) + "</span>";
    } else if (job.linkCopiedAt) {
      bits += '<span class="signal quiet">Link copied, not opened yet</span>';
    }
    if (job.followUp && job.stage !== "closed") {
      bits += '<span class="follow' + (isDue(job) ? " due" : "") + '">Follow up ' + esc(shortDate(dateFromInput(job.followUp))) + "</span>";
    }
    var meta = [job.location, job.pay].filter(Boolean).join(" · ");
    return '<article class="card" role="button" tabindex="0" draggable="true" data-job="' + esc(job.id) + '">' +
      '<div class="card-company">' + esc(job.company || "Company not set") + "</div>" +
      (job.title ? '<div class="card-title">' + esc(job.title) + "</div>" : "") +
      (meta ? '<div class="card-meta">' + esc(meta) + "</div>" : "") +
      bits + "</article>";
  }
  function renderSummary(jobs) {
    var active = jobs.filter(function (j) { return j.stage !== "closed"; });
    var opened = active.filter(function (j) { var v = Sync.viewsFor(j.tag); return v && (v.pf || v.rv || v.rd); }).length;
    var due = active.filter(isDue).length;
    var parts = [active.length + " active"];
    if (opened) parts.push("<b>" + opened + " opened your link</b>");
    if (due) parts.push('<span class="due">' + due + (due === 1 ? " follow-up due" : " follow-ups due") + "</span>");
    $("summary").innerHTML = jobs.length ? parts.join(" · ") : "Your job hunt, all in one place";
  }
  function render() {
    var jobs = Store.all();
    renderSummary(jobs);
    tabs.hidden = !jobs.length;
    if (!jobs.length) {
      tabs.innerHTML = "";
      board.innerHTML = '<section class="welcome"><h2>Save your first job</h2><ol>' +
        "<li>Right-click a job posting and choose <b>Add to Callback</b>, or use <b>Add job</b> here.</li>" +
        "<li>Copy that job's own link when you apply, instead of your usual portfolio link.</li>" +
        "<li>Move the job along as you hear back, and see whether they opened your link.</li>" +
        '</ol><div class="actions"><button class="btn solid" type="button" data-act="add">Add job</button>' +
        (extensionSeen ? "" : '<button class="btn" type="button" data-act="menu">Set up right-click</button>') +
        "</div></section>";
      return;
    }
    var shown = jobs.filter(matches);
    tabs.innerHTML = Store.STAGES.map(function (s) {
      var n = shown.filter(function (j) { return j.stage === s.id; }).length;
      return '<button class="tab" type="button" data-tab="' + s.id + '" aria-pressed="' + (s.id === activeStage) + '">' + esc(s.label) + " " + n + "</button>";
    }).join("");
    board.innerHTML = Store.STAGES.map(function (s) {
      var list = shown.filter(function (j) { return j.stage === s.id; });
      return '<section class="column' + (s.id === activeStage ? " active" : "") + '" data-stage="' + s.id + '" aria-label="' + esc(s.label) + '">' +
        '<h2 class="column-head">' + esc(s.label) + " <span>" + list.length + "</span></h2>" +
        '<div class="cards">' + (list.map(cardHtml).join("") || (query ? "" : '<p class="none">Nothing here yet</p>')) + "</div></section>";
    }).join("");
  }
  function renderBanner() {
    var el = $("banner"), s = Sync.state;
    var message = !Store.isPersistent() ? "This browser isn't letting Callback save anything, so jobs will be lost when you close the tab. Download a backup from the menu."
      : s.status === "denied" ? "Sync needs one more step in Firebase. Your jobs are safe in this browser until then."
      : s.status === "error" ? "Couldn't sync: " + s.message
      : "";
    el.hidden = !message;
    el.innerHTML = message ? "<span>" + esc(message) + '</span><button class="linkish" type="button" data-act="menu">Open settings</button>' : "";
    $("menuDot").hidden = !(s.status === "denied" || s.status === "error");
  }

  board.addEventListener("click", function (e) {
    var act = e.target.closest("[data-act]");
    if (act) return act.dataset.act === "add" ? openNew() : openMenu();
    var card = e.target.closest("[data-job]");
    if (card) openJob(Store.get(card.dataset.job));
  });
  board.addEventListener("keydown", function (e) {
    var card = e.target.closest && e.target.closest("[data-job]");
    if (card && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openJob(Store.get(card.dataset.job)); }
  });
  tabs.addEventListener("click", function (e) {
    var tab = e.target.closest("[data-tab]");
    if (tab) { activeStage = tab.dataset.tab; render(); }
  });
  $("banner").addEventListener("click", function (e) { if (e.target.closest("[data-act]")) openMenu(); });

  // drag a card to another stage
  board.addEventListener("dragstart", function (e) {
    var card = e.target.closest("[data-job]");
    if (!card) return;
    e.dataTransfer.setData("text/plain", card.dataset.job);
    e.dataTransfer.effectAllowed = "move";
    card.classList.add("dragging");
  });
  board.addEventListener("dragend", function (e) {
    var card = e.target.closest("[data-job]");
    if (card) card.classList.remove("dragging");
  });
  board.addEventListener("dragover", function (e) {
    var column = e.target.closest("[data-stage]");
    if (!column) return;
    e.preventDefault();
    Array.from(board.querySelectorAll(".over")).forEach(function (c) { if (c !== column) c.classList.remove("over"); });
    column.classList.add("over");
  });
  board.addEventListener("dragleave", function (e) {
    var column = e.target.closest("[data-stage]");
    if (column && !column.contains(e.relatedTarget)) column.classList.remove("over");
  });
  board.addEventListener("drop", function (e) {
    var column = e.target.closest("[data-stage]");
    if (!column) return;
    e.preventDefault();
    column.classList.remove("over");
    var id = e.dataTransfer.getData("text/plain");
    if (Store.get(id)) Store.update(id, { stage: column.dataset.stage });
  });

  // ---------- the job form ----------
  form.elements.stage.innerHTML = Store.STAGES.map(function (s) { return '<option value="' + s.id + '">' + esc(s.label) + "</option>"; }).join("");

  function readForm() {
    var out = {};
    FIELDS.forEach(function (f) {
      var v = form.elements[f].value;
      out[f] = f === "notes" || f === "jd" ? v : v.trim();
    });
    return out;
  }
  function fillForm(values) {
    FIELDS.forEach(function (f) { form.elements[f].value = values[f] || ""; });
    if (!values.stage) form.elements.stage.value = "saved";
    form.elements.company.classList.remove("missing");
    $("savedNote").textContent = "";
    refreshOpenLink();
  }
  function refreshOpenLink() {
    var url = safeUrl(form.elements.url.value.trim()), a = $("urlOpen");
    a.hidden = !url;
    if (url) a.href = url; else a.removeAttribute("href");
  }
  function refreshDuplicate() {
    var note = $("dupNote"), dup = Store.findDuplicate(readForm(), current && current.id);
    note.hidden = !dup;
    if (!dup) return;
    var what = [dup.company, dup.title].filter(Boolean).join(", ");
    note.innerHTML = "You already saved this: <b>" + esc(what) + "</b>, in " +
      esc(Store.STAGES.filter(function (s) { return s.id === dup.stage; })[0].label) + '. <button class="linkish" type="button" data-open-dup="' + esc(dup.id) + '">Open it</button>';
  }
  function refreshVersions() {
    var seen = {};
    Store.all().forEach(function (j) { if (j.resume) seen[j.resume] = true; });
    $("resumeVersions").innerHTML = Object.keys(seen).sort().map(function (v) { return '<option value="' + esc(v) + '"></option>'; }).join("");
  }
  function refreshLinkSection() {
    var section = $("linkSection");
    section.hidden = !current;
    if (!current) return;
    var links = linksFor(current), v = Sync.viewsFor(current.tag), s = Sync.state;
    $("linkHome").textContent = links.home;
    $("linkResume").textContent = links.resume;
    $("viewsLine").textContent = v && (v.pf || v.rv || v.rd) ? viewedLine(v)
      : s.status === "out" || !s.user ? "Sign in under Settings to see whether they opened it."
      : s.views === "denied" ? "This account can't see visits. Sign in with the Google account your launchpad uses."
      : s.views === "error" ? "Couldn't load visits. " + s.message
      : "Not opened yet.";
  }
  function refreshHistory() {
    var line = $("historyLine");
    line.hidden = !current;
    if (!current) return;
    line.textContent = current.history.map(function (h) {
      return Store.STAGES.filter(function (s) { return s.id === h.stage; })[0].label + " " + shortDate(new Date(h.at));
    }).join(" → ");
  }
  // switches the form's buttons between adding a new job and editing a saved one
  function setMode() {
    var isNew = !current;
    $("jobHeading").textContent = isNew ? "Add job" : current.company || current.title || "Job";
    $("jobClose").hidden = isNew;
    $("jobDelete").hidden = isNew;
    $("jobCancel").hidden = !isNew;
    $("jobSave").hidden = !isNew;
    refreshLinkSection();
    refreshHistory();
    refreshDuplicate();
  }
  function show() {
    refreshVersions();
    if (!jobDialog.open) jobDialog.showModal();
    form.scrollTop = 0;
    jobDialog.scrollTop = 0;
  }
  function openNew(draft) {
    flushSave();
    current = null;
    fillForm(draft || {});
    setMode();
    show();
    form.elements.company.focus();
  }
  function openJob(job) {
    if (!job) return;
    flushSave();
    current = job;
    fillForm(job);
    setMode();
    show();
  }
  function flushSave() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    if (!current || !Store.get(current.id)) return;
    current = Store.update(current.id, readForm()) || current;
  }
  function savedNote(text) {
    var note = $("savedNote");
    note.textContent = text;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(function () { note.textContent = ""; }, 1800);
  }
  function closeJob() {
    flushSave();
    current = null;
    jobDialog.close();
    render();
    var next = pendingDrafts.shift();
    if (next) openNew(next);
  }
  function hasDraftContent() {
    var v = readForm();
    return !current && !!(v.company || v.title || v.url || v.jd || v.notes);
  }

  form.addEventListener("input", function (e) {
    if (e.target.name === "url") refreshOpenLink();
    if (e.target.name === "company") e.target.classList.remove("missing");
    if (["url", "company", "title"].indexOf(e.target.name) >= 0) refreshDuplicate();
    if (!current) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { flushSave(); setHeading(); savedNote("Saved"); }, 400);
  });
  function setHeading() { if (current) $("jobHeading").textContent = current.company || current.title || "Job"; }
  form.addEventListener("change", function (e) {
    if (!current) return;
    flushSave();
    refreshHistory();
    setHeading();
    savedNote("Saved");
  });
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (current) return flushSave(); // Enter in a field of a saved job
    var v = readForm();
    if (!v.company && !v.title) {
      form.elements.company.classList.add("missing");
      form.elements.company.focus();
      return;
    }
    var host = "";
    try { host = new URL(v.url).hostname.replace(/^www\./, ""); } catch (err) {}
    current = Store.add(Object.assign(v, { source: host }));
    activeStage = current.stage;
    setMode();
    savedNote("Saved");
    $("linkSection").scrollIntoView({ block: "nearest" });
  });
  $("jobClose").addEventListener("click", closeJob);
  $("jobCancel").addEventListener("click", function () {
    if (hasDraftContent() && !confirm("Discard this job?")) return;
    closeJob();
  });
  $("jobDelete").addEventListener("click", function () {
    if (!current) return;
    var name = current.company || current.title || "this job";
    if (!confirm("Delete " + name + "? Its link keeps working, but this board won't show its visits any more.")) return;
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    Store.remove(current.id);
    current = null;
    jobDialog.close();
    render();
  });
  // Escape closes a saved job, but never throws away a new one that hasn't been saved
  jobDialog.addEventListener("cancel", function (e) {
    e.preventDefault();
    if (!hasDraftContent()) closeJob();
  });
  $("dupNote").addEventListener("click", function (e) {
    var b = e.target.closest("[data-open-dup]");
    if (b) openJob(Store.get(b.dataset.openDup));
  });
  $("linkSection").addEventListener("click", function (e) {
    var b = e.target.closest("[data-copy]");
    if (!b || !current) return;
    var value = linksFor(current)[b.dataset.copy];
    var done = function () {
      flushSave();
      current = Store.update(current.id, { linkCopiedAt: Date.now() }) || current;
      b.textContent = "Copied";
      setTimeout(function () { b.textContent = "Copy"; }, 1600);
    };
    if (navigator.clipboard) navigator.clipboard.writeText(value).then(done, function () { prompt("Copy this link:", value); done(); });
    else { prompt("Copy this link:", value); done(); }
  });

  // ---------- settings ----------
  function accountHtml() {
    var s = Sync.state;
    if (s.status === "out" || s.status === "idle" || (s.status === "error" && !s.user)) {
      return "<p>Sign in with the Google account your launchpad uses to keep jobs on every device and see who opened each link.</p>" +
        (s.status === "error" ? "<p>" + esc(s.message) + "</p>" : "") +
        '<div class="actions"><button class="btn solid" type="button" data-menu="signin">Sign in with Google</button></div>';
    }
    if (s.status === "loading" && !s.user) return "<p>Signing in…</p>";
    var who = s.user ? s.user.email || s.user.displayName || "your account" : "";
    var syncLine = s.status === "in" ? "Jobs are syncing." : s.status === "loading" ? "Connecting…"
      : s.status === "denied" ? "Jobs aren't syncing yet. In the Firebase console (project github-projects-5d4e4), open Firestore Database → Rules, paste this next to the launchpad rule, and Publish:"
      : "Couldn't sync: " + s.message;
    var viewLine = s.views === "ok" ? "Visits are up to date." : s.views === "loading" ? "Checking visits…"
      : s.views === "denied" ? "This account can't read visits. Use the Google account your launchpad uses."
      : s.views === "error" ? "Couldn't load visits: " + s.message : "";
    return "<p>Signed in as " + esc(who) + ".</p><p>" + esc(syncLine) + "</p>" +
      (s.status === "denied" ? '<pre class="rule">' + esc(Sync.RULE) + "</pre>" : "") +
      (viewLine ? "<p>" + esc(viewLine) + "</p>" : "") +
      '<div class="actions">' +
      (s.status === "denied" ? '<button class="btn" type="button" data-menu="copyrule">Copy rule</button>' : "") +
      '<button class="btn" type="button" data-menu="refresh">Refresh visits</button>' +
      '<button class="btn ghost" type="button" data-menu="signout">Sign out</button></div>';
  }
  function renderMenu() {
    $("menuBody").innerHTML =
      '<section class="menu-part"><h3>Account</h3>' + accountHtml() + "</section>" +
      '<section class="menu-part"><h3>Chrome extension</h3>' +
      (extensionSeen ? "<p>The extension is connected. Right-click any posting and choose <b>Add to Callback</b>. On an application form, click its toolbar icon to fill fields from your saved info.</p>"
        : "<p>Add it in desktop Chrome:</p>" +
          '<div class="actions"><a class="btn solid" href="callback-extension.zip" download>Download the extension</a></div>' +
          "<ol><li>Unzip it and keep the <b>callback-extension</b> folder somewhere permanent, because Chrome loads it from there.</li>" +
          "<li>Open <b>chrome://extensions</b> and turn on <b>Developer mode</b>.</li>" +
          "<li>Click <b>Load unpacked</b> and choose the <b>callback-extension</b> folder.</li></ol>") +
      "</section>" +
      '<section class="menu-part"><h3>Backup</h3><p>Everything you\'ve saved, as one file. Restoring adds to the board and keeps whichever copy of a job changed last.</p>' +
      '<div class="actions"><button class="btn" type="button" data-menu="backup">Download backup</button>' +
      '<button class="btn" type="button" data-menu="restore">Restore from a backup</button></div><p id="restoreNote" role="status"></p></section>';
  }
  function openMenu() {
    renderMenu();
    if (!menuDialog.open) menuDialog.showModal();
  }
  $("menuBtn").addEventListener("click", openMenu);
  $("menuClose").addEventListener("click", function () { menuDialog.close(); });
  $("menuBody").addEventListener("click", function (e) {
    var b = e.target.closest("[data-menu]");
    if (!b) return;
    var act = b.dataset.menu;
    if (act === "signin") Sync.signIn();
    if (act === "signout") Sync.signOut();
    if (act === "refresh") Sync.refreshViews();
    if (act === "copyrule") {
      if (navigator.clipboard) navigator.clipboard.writeText(Sync.RULE).then(function () { b.textContent = "Copied"; });
    }
    if (act === "backup") backup();
    if (act === "restore") $("restoreFile").click();
  });
  function backup() {
    var body = JSON.stringify({ app: "callback", version: 1, exportedAt: new Date().toISOString(), jobs: Store.raw() }, null, 2);
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([body], { type: "application/json" }));
    a.download = "callback-backup-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  $("restoreFile").addEventListener("change", function (e) {
    var file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    file.text().then(function (body) {
      var data = JSON.parse(body);
      if (!data || data.app !== "callback" || !Array.isArray(data.jobs)) throw new Error("not a backup");
      var n = Store.merge(data.jobs, { fromBackup: true });
      var note = $("restoreNote");
      if (note) note.textContent = n ? "Restored " + n + (n === 1 ? " job." : " jobs.") : "Nothing new in that backup.";
    }).catch(function () {
      var note = $("restoreNote");
      if (note) note.textContent = "That file isn't a Callback backup.";
    });
  });

  // ---------- the extension ----------
  // extension/bridge.js is the only thing here that talks to it. Drafts are text from whatever
  // page was captured, so they go into the form as plain values and wait for review.
  function receiveDraft(d) {
    if (!d || typeof d !== "object") return;
    var draft = {};
    ["company", "title", "location", "pay", "url", "jd"].forEach(function (k) {
      if (typeof d[k] === "string") draft[k] = d[k];
    });
    if (draft.url && !safeUrl(draft.url)) delete draft.url;
    if (jobDialog.open && hasDraftContent()) { pendingDrafts.push(draft); return; }
    if (jobDialog.open) { flushSave(); current = null; }
    openNew(draft);
  }
  function sayReady() { window.postMessage({ source: "callback-page", type: "ready" }, location.origin); }
  // So the side panel can offer the right tracked link on an application form. Only these
  // fields go: the extension doesn't need notes, job descriptions or visit counts.
  var lastJobsSent = "";
  function tellExtensionJobs() {
    if (!extensionSeen) return;
    var jobs = Store.all().map(function (j) {
      return { tag: j.tag, company: j.company, title: j.title, url: j.url, stage: j.stage, updatedAt: j.updatedAt, links: linksFor(j) };
    });
    var text = JSON.stringify(jobs);
    if (text === lastJobsSent) return;
    lastJobsSent = text;
    window.postMessage({ source: "callback-page", type: "jobs", jobs: jobs }, location.origin);
  }
  window.addEventListener("message", function (e) {
    if (e.source !== window || e.origin !== location.origin || !e.data || e.data.source !== "callback-ext") return;
    if (e.data.type === "hello") {
      if (!extensionSeen) { extensionSeen = true; render(); if (menuDialog.open) renderMenu(); }
      sayReady();
      tellExtensionJobs();
    }
    if (e.data.type === "draft") receiveDraft(e.data.draft);
  });

  // ---------- start ----------
  $("addBtn").addEventListener("click", function () { openNew(); });
  $("search").addEventListener("input", function (e) { query = e.target.value.trim().toLowerCase(); render(); });
  Store.onChange(function () {
    if (current && !Store.get(current.id)) { current = null; jobDialog.close(); }
    else if (current) { current = Store.get(current.id); refreshHistory(); }
    render();
    tellExtensionJobs();
  });
  Sync.onChange(function () {
    renderBanner();
    render();
    if (menuDialog.open) renderMenu();
    if (jobDialog.open) refreshLinkSection();
  });
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) flushSave();
    else if (!jobDialog.open) Store.reload();
  });
  window.addEventListener("pagehide", flushSave); // closing the tab right after typing
  Store.init().then(function () {
    render();
    renderBanner();
    Sync.init();
    renderBanner();
    sayReady();
    tellExtensionJobs();
  });
})();
