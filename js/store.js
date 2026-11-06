/* =========================================================
   Store: the jobs, kept in this browser

   Saved job descriptions are long, and every project on jkw2lo.github.io shares
   one localStorage allowance, so jobs live in IndexedDB instead. Everything is
   held in memory once loaded and written through on each change. A deleted job
   stays as an empty tombstone so that the deletion can reach other devices.
   ========================================================= */
window.Store = (function () {
  "use strict";

  var DB = "callback", OBJECTS = "jobs";
  var STAGES = [
    { id: "saved", label: "Saved" },
    { id: "applied", label: "Applied" },
    { id: "interviewing", label: "Interviewing" },
    { id: "offer", label: "Offer" },
    { id: "closed", label: "Closed" }
  ];
  var STAGE_IDS = STAGES.map(function (s) { return s.id; });
  var TAG_LETTERS = "abcdefghjkmnpqrstuvwxyz23456789"; // no look-alikes, so a tag can be read aloud

  var jobs = {};
  var db = null;
  var persistent = false;
  var changeListeners = [], localListeners = [];

  // ---------- IndexedDB ----------
  function open() {
    return new Promise(function (ok, no) {
      var req = indexedDB.open(DB, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(OBJECTS, { keyPath: "id" }); };
      req.onsuccess = function () { ok(req.result); };
      req.onerror = function () { no(req.error); };
    });
  }
  function readAll() {
    return new Promise(function (ok, no) {
      var req = db.transaction(OBJECTS).objectStore(OBJECTS).getAll();
      req.onsuccess = function () { ok(req.result || []); };
      req.onerror = function () { no(req.error); };
    });
  }
  function write(job) {
    if (!db) return;
    try { db.transaction(OBJECTS, "readwrite").objectStore(OBJECTS).put(job); } catch (e) { persistent = false; }
  }
  function loadFromDb() {
    return readAll().then(function (list) {
      var next = {};
      list.forEach(function (raw) { var j = clean(raw); if (j) next[j.id] = j; });
      jobs = next;
    });
  }

  // ---------- shaping ----------
  var text = function (v, max) { return typeof v === "string" ? v.slice(0, max) : ""; };
  var num = function (v) { return typeof v === "number" && isFinite(v) ? v : 0; };
  function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function randomTag() {
    var bytes = new Uint8Array(6), out = "";
    crypto.getRandomValues(bytes);
    for (var i = 0; i < bytes.length; i++) out += TAG_LETTERS[bytes[i] % TAG_LETTERS.length];
    return out;
  }
  function newTag() {
    var used = {}, tag;
    Object.keys(jobs).forEach(function (id) { used[jobs[id].tag] = true; });
    do { tag = randomTag(); } while (used[tag]);
    return tag;
  }
  // Everything that enters the store goes through here: forms, the extension, backups, other devices
  function clean(raw) {
    if (!raw || typeof raw !== "object" || !/^[a-z0-9]{1,40}$/.test(raw.id || "")) return null;
    var stage = STAGE_IDS.indexOf(raw.stage) >= 0 ? raw.stage : "saved";
    return {
      id: raw.id,
      tag: /^[a-z0-9-]{1,16}$/.test(raw.tag || "") ? raw.tag : newTag(),
      company: text(raw.company, 120),
      title: text(raw.title, 160),
      location: text(raw.location, 120),
      pay: text(raw.pay, 80),
      url: text(raw.url, 2000),
      source: text(raw.source, 120),
      stage: stage,
      resume: text(raw.resume, 80),
      followUp: /^\d{4}-\d{2}-\d{2}$/.test(raw.followUp || "") ? raw.followUp : "",
      notes: text(raw.notes, 20000),
      jd: text(raw.jd, 30000),
      history: (Array.isArray(raw.history) ? raw.history : []).slice(-50).filter(function (h) {
        return h && STAGE_IDS.indexOf(h.stage) >= 0 && num(h.at);
      }).map(function (h) { return { stage: h.stage, at: h.at }; }),
      linkCopiedAt: num(raw.linkCopiedAt),
      createdAt: num(raw.createdAt),
      updatedAt: num(raw.updatedAt),
      deleted: raw.deleted === true
    };
  }

  // ---------- listeners ----------
  function changed() { changeListeners.forEach(function (fn) { fn(); }); }
  function changedLocally(job) { localListeners.forEach(function (fn) { fn(job); }); }
  function commit(job) {
    jobs[job.id] = job;
    write(job);
    changedLocally(job);
    changed();
    return job;
  }

  // ---------- matching a saved posting ----------
  // The same posting often comes back with tracking on the end. Ids in the query stay,
  // because some sites (LinkedIn's search page) keep the job's id there.
  function sameUrl(u) {
    try {
      var url = new URL(u);
      url.hash = "";
      Array.from(url.searchParams.keys()).forEach(function (k) {
        if (/^(utm_|gh_src|gh_jid_src|ref|refid|src|source|trk|lever-)/i.test(k)) url.searchParams.delete(k);
      });
      return (url.hostname.replace(/^www\./, "") + url.pathname.replace(/\/+$/, "") + url.search).toLowerCase();
    } catch (e) { return ""; }
  }
  var sameText = function (s) { return String(s || "").trim().toLowerCase(); };
  function findDuplicate(fields, exceptId) {
    var url = sameUrl(fields.url), company = sameText(fields.company), title = sameText(fields.title);
    return all().filter(function (j) {
      if (j.id === exceptId) return false;
      if (url && sameUrl(j.url) === url) return true;
      return !!(company && title && sameText(j.company) === company && sameText(j.title) === title);
    })[0] || null;
  }

  function all() {
    return Object.keys(jobs).map(function (id) { return jobs[id]; }).filter(function (j) { return !j.deleted; })
      .sort(function (a, b) { return b.updatedAt - a.updatedAt; });
  }

  return {
    STAGES: STAGES,
    init: function () {
      if (!window.indexedDB) return Promise.resolve(false);
      return open().then(function (d) {
        db = d;
        persistent = true;
        return loadFromDb();
      }).then(function () { return true; }, function () { return false; });
    },
    // another tab may have changed things while this one was in the background
    reload: function () {
      if (!db) return Promise.resolve();
      return loadFromDb().then(changed, function () {});
    },
    isPersistent: function () { return persistent; },
    all: all,
    get: function (id) { var j = jobs[id]; return j && !j.deleted ? j : null; },
    raw: function () { return Object.keys(jobs).map(function (id) { return jobs[id]; }); },
    findDuplicate: findDuplicate,
    add: function (fields) {
      var now = Date.now();
      var stage = STAGE_IDS.indexOf(fields.stage) >= 0 ? fields.stage : "saved";
      return commit(clean(Object.assign({}, fields, {
        id: newId(), tag: newTag(), stage: stage,
        history: [{ stage: stage, at: now }], createdAt: now, updatedAt: now, deleted: false
      })));
    },
    update: function (id, patch) {
      var job = jobs[id];
      if (!job || job.deleted) return null;
      var changes = Object.keys(patch).some(function (k) { return patch[k] !== job[k]; });
      if (!changes) return job;
      var next = Object.assign({}, job, patch, { id: job.id, tag: job.tag, updatedAt: Date.now() });
      if (patch.stage && patch.stage !== job.stage) next.history = job.history.concat([{ stage: patch.stage, at: next.updatedAt }]);
      return commit(clean(next));
    },
    remove: function (id) {
      var job = jobs[id];
      if (!job) return;
      commit(clean({ id: job.id, tag: job.tag, createdAt: job.createdAt, updatedAt: Date.now(), deleted: true }));
    },
    // From another device or a backup: whichever copy changed last wins. Returns how many changed.
    merge: function (list, opts) {
      var count = 0;
      (list || []).forEach(function (raw) {
        var job = clean(raw);
        if (!job) return;
        var mine = jobs[job.id];
        if (mine && mine.updatedAt >= job.updatedAt) return;
        jobs[job.id] = job;
        write(job);
        if (opts && opts.fromBackup) changedLocally(job);
        count++;
      });
      if (count) changed();
      return count;
    },
    onChange: function (fn) { changeListeners.push(fn); },
    onLocalChange: function (fn) { localListeners.push(fn); }
  };
})();
