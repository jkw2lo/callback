/* The side panel's My info tab: everything you've saved, autosaving as you type. */
(function () {
  "use strict";
  var h = Panel.h;
  var RESUME_URL = "https://jkw2lo.github.io/projects/resume.json";
  var view = document.getElementById("infoView");
  var open = { about: true }; // which sections are expanded
  var statusText = "";

  function input(label, value, onChange, opts) {
    opts = opts || {};
    var control = opts.long
      ? h("textarea", { rows: opts.rows || 3, oninput: function (e) { onChange(e.target.value); } })
      : h("input", { type: opts.type || "text", autocomplete: "off", oninput: function (e) { onChange(e.target.value); } });
    control.value = value || "";
    if (opts.name) control.setAttribute("data-info", opts.name);
    return h("label", { cls: "field" }, h("span", { text: label }), control);
  }
  function part(id, title, hint) {
    var body = h("div", { cls: "part-body" }, hint ? h("p", { cls: "hint", text: hint }) : null);
    var d = h("details", { cls: "part", "data-part": id }, h("summary", { text: title }), body);
    d.open = !!open[id];
    d.addEventListener("toggle", function () { open[id] = d.open; });
    return { el: d, body: body };
  }
  function basic(p, key, label, opts) {
    return input(label, p.basics[key], function (v) { p.basics[key] = v; Panel.saveProfile(); }, Object.assign({ name: "basics." + key }, opts || {}));
  }
  function bound(obj, key, label, opts) {
    return input(label, obj[key], function (v) { obj[key] = v; Panel.saveProfile(); }, opts);
  }

  function aboutPart(p) {
    var x = part("about", "About you");
    x.body.append(
      h("div", { cls: "two" }, basic(p, "firstName", "First name"), basic(p, "lastName", "Last name")),
      h("div", { cls: "two" }, basic(p, "preferredName", "Preferred name"), basic(p, "pronouns", "Pronouns")),
      basic(p, "email", "Email", { type: "email" }),
      basic(p, "phone", "Phone", { type: "tel" }),
      basic(p, "street", "Street address"),
      h("div", { cls: "two" }, basic(p, "city", "City"), basic(p, "region", "State or province")),
      h("div", { cls: "two" }, basic(p, "postal", "Zip or postal code"), basic(p, "country", "Country")),
      basic(p, "location", "Location, as you'd write it"));
    return x.el;
  }
  function linksPart(p) {
    var x = part("links", "Links", "Applications for a job on your board get its tracked portfolio link first.");
    x.body.append(basic(p, "linkedin", "LinkedIn"), basic(p, "github", "GitHub"), basic(p, "portfolio", "Portfolio"), basic(p, "website", "Website"));
    return x.el;
  }
  function jobsPart(p) {
    var x = part("jobs", "Work history", "Most recent first.");
    p.jobs.forEach(function (j, i) {
      x.body.append(h("div", { cls: "entry", "data-entry": "job" },
        bound(j, "company", "Company"), bound(j, "title", "Title"), bound(j, "location", "Location"),
        h("div", { cls: "two" }, bound(j, "start", "Start", { type: "month" }), bound(j, "end", "End", { type: "month" })),
        h("label", { cls: "check" }, (function () {
          var c = h("input", { type: "checkbox", onchange: function (e) { j.current = e.target.checked; Panel.saveProfile(); } });
          c.checked = !!j.current;
          return c;
        })(), h("span", { text: "I work here now" })),
        bound(j, "description", "Description", { long: true, rows: 5 }),
        h("div", { cls: "row" }, h("button", { cls: "btn ghost danger", type: "button", text: "Remove", onclick: function () { p.jobs.splice(i, 1); Panel.saveProfile(); render(); } }))));
    });
    x.body.append(h("div", { cls: "row" }, h("button", { cls: "btn", type: "button", id: "addWork", text: "Add a job", onclick: function () {
      p.jobs.push({ company: "", title: "", location: "", start: "", end: "", current: false, description: "" });
      open.jobs = true; Panel.saveProfile(); render();
    } })));
    return x.el;
  }
  function eduPart(p) {
    var x = part("edu", "Education");
    p.education.forEach(function (e, i) {
      x.body.append(h("div", { cls: "entry", "data-entry": "edu" },
        bound(e, "school", "School"), bound(e, "degree", "Degree"), bound(e, "field", "Field of study"),
        h("div", { cls: "two" }, bound(e, "start", "Start", { type: "month" }), bound(e, "end", "End", { type: "month" })),
        bound(e, "gpa", "GPA"),
        h("div", { cls: "row" }, h("button", { cls: "btn ghost danger", type: "button", text: "Remove", onclick: function () { p.education.splice(i, 1); Panel.saveProfile(); render(); } }))));
    });
    x.body.append(h("div", { cls: "row" }, h("button", { cls: "btn", type: "button", text: "Add a school", onclick: function () {
      p.education.push({ school: "", degree: "", field: "", start: "", end: "", gpa: "" });
      open.edu = true; Panel.saveProfile(); render();
    } })));
    return x.el;
  }
  function choice(p, kind) {
    var c = Match.CHOICES[kind];
    var select = h("select", { "data-answer": kind, onchange: function (e) {
      if (e.target.value) p.answers[kind] = e.target.value; else delete p.answers[kind];
      Panel.saveProfile();
    } }, h("option", { value: "", text: "Not set" }));
    c.choices.forEach(function (o) { select.append(h("option", { value: o[0], text: o[1] })); });
    select.value = p.answers[kind] || "";
    return h("label", { cls: "field" }, h("span", { text: c.title }), select);
  }
  function questionsPart(p) {
    var x = part("common", "Common questions");
    Object.keys(Match.CHOICES).filter(function (k) { return !Match.CHOICES[k].self; }).forEach(function (k) { x.body.append(choice(p, k)); });
    x.body.append(
      bound(p.texts, "yearsExp", "Years of experience"),
      bound(p.texts, "salary", "Pay expectations"),
      bound(p.texts, "availability", "When you can start, or your notice period"),
      bound(p.texts, "hearAbout", "How you heard about jobs"),
      bound(p.texts, "skills", "Skills", { long: true }),
      bound(p.texts, "summary", "Summary", { long: true, rows: 4 }));
    return x.el;
  }
  function prefsPart(p) {
    var pr = p.prefs;
    var x = part("prefs", "What you're looking for", "The Fit tab compares postings with this.");
    var cur = h("select", { "data-pref": "currency", onchange: function (e) { pr.currency = e.target.value; Panel.saveProfile(); } });
    ["USD", "CAD", "GBP", "EUR"].forEach(function (c) { cur.append(h("option", { value: c, text: c })); });
    cur.value = pr.currency || "USD";
    x.body.append(
      h("div", { cls: "two" },
        bound(pr, "payMin", "Lowest yearly pay", { type: "number", name: "prefs.payMin" }),
        bound(pr, "payMax", "Hoped-for yearly pay", { type: "number", name: "prefs.payMax" })),
      h("label", { cls: "field" }, h("span", { text: "Currency" }), cur),
      h("div", { cls: "field" }, h("span", { text: "Work styles you'd take" }),
        h.apply(null, ["div", { cls: "row" }].concat(["remote", "hybrid", "onsite"].map(function (k) {
          var c = h("input", { type: "checkbox", "data-style": k, onchange: function (e) { pr.styles[k] = e.target.checked; Panel.saveProfile(); } });
          c.checked = pr.styles[k] !== false;
          return h("label", { cls: "check" }, c, h("span", { text: { remote: "Remote", hybrid: "Hybrid", onsite: "On-site" }[k] }));
        })))),
      bound(pr, "places", "Places you'd work, separated by commas", { name: "prefs.places" }));
    return x.el;
  }
  function claudePart() {
    var x = part("claude", "Claude analysis", "Optional. With your own Claude API key, the Fit tab can ask Claude for a line-by-line reading. It sends the posting with your work history, education, skills and summary, never your contact details or self-ID answers, and only when you press Analyze. Billing is on your key.");
    chrome.storage.local.get("settings").then(function (r) {
      var s = r.settings || {};
      var key = h("input", { type: "password", autocomplete: "off", spellcheck: "false", placeholder: "sk-ant-…", "data-setting": "claudeKey" });
      key.value = s.claudeKey || "";
      var model = h("select", { "data-setting": "claudeModel" });
      Object.keys(Fit.MODELS).forEach(function (id) { model.append(h("option", { value: id, text: Fit.MODELS[id].name + ", about " + Fit.money(Fit.estimate(id)) + " a posting" })); });
      model.value = Fit.MODELS[s.claudeModel] ? s.claudeModel : Fit.DEFAULT_MODEL;
      function store() {
        var next = { claudeKey: key.value.trim(), claudeModel: model.value };
        chrome.storage.local.set({ settings: next });
      }
      key.addEventListener("change", store);
      model.addEventListener("change", store);
      x.body.append(
        h("label", { cls: "field" }, h("span", { text: "Claude API key" }), key),
        h("label", { cls: "field" }, h("span", { text: "Model" }), model),
        h("p", { cls: "hint", text: "The key stays in this browser, separate from your info, and isn't in downloaded copies. Results are kept, so the same posting isn't paid for twice." }),
        h("div", { cls: "row" }, h("button", { cls: "btn ghost danger", type: "button", id: "removeKey", text: "Remove key", onclick: function () { key.value = ""; store(); } })));
    });
    return x.el;
  }
  function selfIdPart(p) {
    var x = part("self", "Voluntary self-identification", "Optional, and blank until you choose. These stay in this browser, and reach a form only when you pick one or use Fill the form. A downloaded copy leaves them out unless you ask for them.");
    Object.keys(Match.CHOICES).filter(function (k) { return Match.CHOICES[k].self; }).forEach(function (k) { x.body.append(choice(p, k)); });
    return x.el;
  }
  function savedPart(p) {
    var x = part("saved", "Saved answers (" + p.saved.length + ")", "Answers you've kept for other questions. Similar questions on later forms will suggest them.");
    p.saved.forEach(function (s, i) {
      x.body.append(h("div", { cls: "entry", "data-entry": "saved" },
        bound(s, "q", "Question"), bound(s, "a", "Answer", { long: true }),
        h("div", { cls: "row" }, h("button", { cls: "btn ghost danger", type: "button", text: "Remove", onclick: function () { p.saved.splice(i, 1); Panel.saveProfile(); render(); } }))));
    });
    x.body.append(h("div", { cls: "row" }, h("button", { cls: "btn", type: "button", text: "Add an answer", onclick: function () {
      p.saved.push({ q: "", a: "" });
      open.saved = true; Panel.saveProfile(); render();
    } })));
    return x.el;
  }

  // ---------- bringing info in and out ----------
  async function importResume() {
    say("Fetching your resume…");
    try {
      var res = await fetch(RESUME_URL, { cache: "no-cache" });
      if (!res.ok) throw new Error(res.status);
      var added = Profile.importResume(Panel.profile(), await res.json());
      Panel.saveProfile();
      var b = Panel.profile().basics;
      statusText = "Added " + added.jobs + (added.jobs === 1 ? " job, " : " jobs, ") + added.education + (added.education === 1 ? " school" : " schools") + " and " + added.basics + " details. Nothing you'd already filled in changed." +
        (!b.email || !b.phone ? " Add your email and phone under About you: your resume doesn't list them." : "");
      open.jobs = true;
      render();
    } catch (e) {
      say("Couldn't fetch your resume. Check your connection and try again.");
    }
  }
  function say(text) {
    statusText = text;
    var el = document.getElementById("infoStatus");
    if (el) el.textContent = text;
  }
  function download(includeSelf) {
    var p = JSON.parse(JSON.stringify(Panel.profile()));
    if (!includeSelf) Object.keys(Match.CHOICES).forEach(function (k) { if (Match.CHOICES[k].self) delete p.answers[k]; });
    var url = URL.createObjectURL(new Blob([JSON.stringify({ callbackProfile: 1, profile: p }, null, 2)], { type: "application/json" }));
    var a = h("a", { href: url, download: "callback-my-info.json" });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }
  var fileInput = document.getElementById("backupFile");
  fileInput.addEventListener("change", async function () {
    var file = fileInput.files[0];
    fileInput.value = "";
    if (!file) return;
    try {
      var data = JSON.parse(await file.text());
      if (data.callbackProfile !== 1) throw new Error("not ours");
      if (!Profile.isEmpty(Panel.profile()) && !confirm("Replace everything saved here with this file?")) return;
      Panel.replaceProfile(Profile.normalize(data.profile));
      statusText = "Restored from " + file.name + ".";
      render();
    } catch (e) {
      say("That file isn't a Callback info backup.");
    }
  });

  async function sitesPart() {
    var scripts = await chrome.scripting.getRegisteredContentScripts();
    var sites = scripts.filter(function (s) { return s.id.indexOf("site-") === 0; });
    if (!sites.length) return null;
    var x = part("sites", "Sites you turned on");
    sites.forEach(function (s) {
      var origin = s.id.slice(5);
      x.body.append(h("div", { cls: "row" }, h("span", { cls: "grow", text: origin.replace(/^https?:\/\//, "") }),
        h("button", { cls: "btn ghost danger", type: "button", text: "Turn off", onclick: async function () {
          await chrome.scripting.unregisterContentScripts({ ids: [s.id] });
          await chrome.permissions.remove({ origins: [origin + "/*"] }).catch(function () {});
          render();
        } })));
    });
    return x.el;
  }

  async function render() {
    var p = Panel.profile();
    var keep = view.scrollTop;
    view.textContent = "";
    view.append(h("div", { cls: "card" },
      h("h2", { text: Profile.isEmpty(p) ? "Start from your resume" : "Bring in your resume" }),
      h("p", { cls: "muted small", text: "Pulls your work history, education and links from your Projects site. It only adds what's missing." }),
      h("div", { cls: "row" }, h("button", { cls: "btn solid", type: "button", id: "importResume", text: "Import my resume", onclick: importResume })),
      h("p", { cls: "status", id: "infoStatus", role: "status", text: statusText })));
    view.append(aboutPart(p), linksPart(p), jobsPart(p), eduPart(p), questionsPart(p), selfIdPart(p), savedPart(p), prefsPart(p), claudePart());
    var sites = await sitesPart();
    if (sites) view.append(sites);
    view.append(h("div", { cls: "card" },
      h("h2", { text: "Your info, as a file" }),
      h("p", { cls: "muted small", text: "Everything here lives only in this browser and is erased if you remove the extension, so keep a copy." }),
      h("div", { cls: "row" },
        h("button", { cls: "btn", type: "button", id: "backupInfo", text: "Download a copy", onclick: function () { download(false); } }),
        h("button", { cls: "btn", type: "button", id: "backupAll", text: "Include self-ID answers", onclick: function () { download(true); } }),
        h("button", { cls: "btn", type: "button", id: "restoreInfo", text: "Restore", onclick: function () { fileInput.click(); } })),
      h("div", { cls: "row" }, h("button", { cls: "btn ghost danger", type: "button", id: "eraseInfo", text: "Erase all my info", onclick: function () {
        if (!confirm("Erase everything saved in Callback's My info? This can't be undone.")) return;
        Panel.replaceProfile(Profile.blank());
        statusText = "";
        render();
      } }))));
    view.scrollTop = keep;
  }
  window.Info = { render: render };
})();
