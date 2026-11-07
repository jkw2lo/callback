/* Your saved info. It lives only in this extension's storage in this browser: it never goes
   to Firebase or the board, and a page sees a value only when you fill it in from the panel. */
(function (root) {
  "use strict";

  var BASICS = ["firstName", "lastName", "preferredName", "pronouns", "email", "phone", "street", "city", "region", "postal", "country", "location", "linkedin", "github", "portfolio", "website"];
  var TEXTS = ["salary", "availability", "yearsExp", "hearAbout", "skills", "summary"];

  function blank() {
    var basics = {};
    BASICS.forEach(function (k) { basics[k] = ""; });
    return { basics: basics, jobs: [], education: [], answers: {}, texts: {}, saved: [], learned: {}, prefs: blankPrefs() };
  }
  // What you're looking for, for the Fit tab
  function blankPrefs() {
    return { payMin: "", payMax: "", currency: "USD", styles: { remote: true, hybrid: true, onsite: true }, places: "" };
  }
  function normalize(p) {
    var out = blank();
    if (!p || typeof p !== "object") return out;
    BASICS.forEach(function (k) { if (p.basics && typeof p.basics[k] === "string") out.basics[k] = p.basics[k]; });
    ["jobs", "education", "saved"].forEach(function (k) { if (Array.isArray(p[k])) out[k] = p[k].filter(function (x) { return x && typeof x === "object"; }); });
    ["answers", "texts", "learned"].forEach(function (k) { if (p[k] && typeof p[k] === "object" && !Array.isArray(p[k])) out[k] = p[k]; });
    if (p.prefs && typeof p.prefs === "object") {
      var pr = p.prefs;
      out.prefs.payMin = pr.payMin == null ? "" : String(pr.payMin);
      out.prefs.payMax = pr.payMax == null ? "" : String(pr.payMax);
      if (/^[A-Z]{3}$/.test(pr.currency || "")) out.prefs.currency = pr.currency;
      if (pr.styles && typeof pr.styles === "object") ["remote", "hybrid", "onsite"].forEach(function (k) { if (typeof pr.styles[k] === "boolean") out.prefs.styles[k] = pr.styles[k]; });
      if (typeof pr.places === "string") out.prefs.places = pr.places;
    }
    return out;
  }
  function load() {
    return chrome.storage.local.get("profile").then(function (r) { return normalize(r.profile); });
  }
  // "writer" lets a panel tell its own saves from another window's
  function save(p, writer) { return chrome.storage.local.set({ profile: Object.assign({}, p, { writer: writer }) }); }
  function isEmpty(p) {
    return !BASICS.some(function (k) { return p.basics[k]; }) && !p.jobs.length && !p.education.length;
  }

  // "Nov 2024" -> "2024-11"; "2019" -> "2019"; anything else, such as "Present", -> ""
  var MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  function parseDate(s) {
    var t = String(s || "").trim().toLowerCase();
    var named = /^([a-z]{3})[a-z]*\.?\s+(\d{4})$/.exec(t);
    if (named && MONTHS.indexOf(named[1]) >= 0) {
      var m = MONTHS.indexOf(named[1]) + 1;
      return named[2] + "-" + (m < 10 ? "0" : "") + m;
    }
    return /^\d{4}(-\d{2})?$/.test(t) ? t : "";
  }

  // The Projects site's resume.json. Only ever fills blanks and adds what's missing.
  function importResume(p, r) {
    var added = { jobs: 0, education: 0, basics: 0 };
    function fill(k, v) {
      if (v && !p.basics[k]) { p.basics[k] = String(v).trim(); added.basics++; }
    }
    var name = String(r.name || "").trim().split(/\s+/);
    if (name[0]) fill("firstName", name[0]);
    if (name.length > 1) fill("lastName", name.slice(1).join(" "));
    fill("location", r.location);
    fill("email", r.email);
    fill("phone", r.phone);
    (Array.isArray(r.links) ? r.links : []).forEach(function (l) {
      var what = String((l && (l.label || l.url)) || "").toLowerCase();
      if (/linkedin/.test(what)) fill("linkedin", l.url);
      else if (/github/.test(what)) fill("github", l.url);
      else if (/portfolio/.test(what)) fill("portfolio", l.url);
      else fill("website", l.url);
    });
    (Array.isArray(r.experience) ? r.experience : []).forEach(function (e) {
      var same = p.jobs.some(function (j) { return j.company === e.org && j.title === e.role; });
      if (same) return;
      p.jobs.push({
        company: e.org || "", title: e.role || "", location: e.where || "",
        start: parseDate(e.start), end: parseDate(e.end), current: /present|current/i.test(e.end || ""),
        description: (Array.isArray(e.points) ? e.points : []).map(function (x) { return "• " + x; }).join("\n")
      });
      added.jobs++;
    });
    (Array.isArray(r.education) ? r.education : []).forEach(function (e) {
      var same = p.education.some(function (x) { return x.school === e.school && x.degree === e.degree; });
      if (same) return;
      p.education.push({ school: e.school || "", degree: e.degree || "", field: e.note || "", start: parseDate(e.start), end: parseDate(e.end), gpa: "" });
      added.education++;
    });
    if (Array.isArray(r.skills) && !(p.texts.skills)) {
      p.texts.skills = r.skills.map(function (g) { return (g.items || []).join(", "); }).filter(Boolean).join(", ");
    }
    if (r.summary && !p.texts.summary) p.texts.summary = String(r.summary);
    return added;
  }

  root.Profile = { BASICS: BASICS, TEXTS: TEXTS, blank: blank, normalize: normalize, load: load, save: save, isEmpty: isEmpty, parseDate: parseDate, importResume: importResume };
})(typeof window !== "undefined" ? window : globalThis);
