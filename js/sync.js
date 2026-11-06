/* =========================================================
   Sync: jobs across devices, and who opened each link

   Optional Google sign-in through the shared Firebase project
   `github-projects-5d4e4`, the one the launchpad and the Projects site use.
   Signing in to any of them signs in to all of them on this site.

   Jobs:   jobhunt/{uid}/jobs/{jobId}, whichever copy changed last wins.
   Visits: read-only from showcase_visits, written by the Projects site:
           "pf-<tag>" home page, "rv-<tag>" resume viewed, "rd-<tag>" resume downloaded.

   The Firebase SDK (~500KB) only downloads once this browser has signed in here or
   on the launchpad, or when the sign-in button is pressed.
   ========================================================= */
window.Sync = (function () {
  "use strict";

  var CONFIG = {
    apiKey: "AIzaSyBeIyBs3FtSx9T_wlJHsCqkfxZkhbX3Qhk",
    authDomain: "github-projects-5d4e4.firebaseapp.com",
    projectId: "github-projects-5d4e4",
    storageBucket: "github-projects-5d4e4.firebasestorage.app",
    messagingSenderId: "745706177240",
    appId: "1:745706177240:web:8e3f1f92ceafb1fa444dad"
  };
  var SDK = "https://cdn.jsdelivr.net/npm/firebase@10.14.1/";
  var PARTS = ["firebase-app-compat.js", "firebase-auth-compat.js", "firebase-firestore-compat.js"];
  var SEEN = "callback:signed-in", LAUNCHPAD_SEEN = "jens_launchpad:signed-in", CACHE = "callback:views";
  var MINE = "projects:me"; // the Projects site's marker: this browser's own visits aren't counted
  var VIEW_LIMIT = 5000;
  var RULE = "match /jobhunt/{uid}/{document=**} {\n" +
    "  allow read, write: if request.auth != null && request.auth.uid == uid;\n" +
    "}";

  // status: idle | loading | out | in | denied | error
  // views:  idle | loading | ok | denied | error
  var state = { status: "idle", views: "idle", user: null, message: "" };
  var views = {};
  var listeners = [], sdk = null, jobsRef = null, stopListening = null, viewsAt = 0;

  function get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function set(key, value) { try { localStorage.setItem(key, value); } catch (e) {} }
  function unset(key) { try { localStorage.removeItem(key); } catch (e) {} }
  function notify() { listeners.forEach(function (fn) { fn(); }); }

  try { views = JSON.parse(get(CACHE) || "{}") || {}; } catch (e) { views = {}; }

  function loadSdk() {
    if (sdk) return sdk;
    var load = function (file) {
      return new Promise(function (ok, no) {
        var el = document.createElement("script");
        el.src = SDK + file; el.async = false; el.onload = ok; el.onerror = no;
        document.head.appendChild(el);
      });
    };
    var ready = window.firebase ? Promise.resolve() : PARTS.reduce(function (p, file) {
      return p.then(function () { return load(file); });
    }, Promise.resolve());
    sdk = ready.then(function () {
      if (!window.firebase.apps.length) window.firebase.initializeApp(CONFIG);
      return window.firebase;
    });
    return sdk;
  }

  function reason(e) {
    var code = (e && e.code) || "";
    if (code === "auth/unauthorized-domain") return location.hostname + " isn't an authorised domain in the Firebase project.";
    if (code === "auth/network-request-failed" || code === "unavailable") return "Couldn't reach the server. Check the connection.";
    return (e && e.message) || "Something went wrong.";
  }
  var denied = function (e) { return !!e && /permission-denied/.test(e.code || ""); };

  // ---------- jobs ----------
  function push(job) {
    if (!jobsRef) return;
    jobsRef.doc(job.id).set(job).catch(function (e) {
      if (denied(e)) { state.status = "denied"; notify(); }
    });
  }
  function listen(fb, user) {
    jobsRef = fb.firestore().collection("jobhunt").doc(user.uid).collection("jobs");
    stopListening = jobsRef.onSnapshot(function (snap) {
      var theirs = {};
      var list = snap.docs.map(function (doc) { var j = doc.data(); theirs[doc.id] = j; return j; });
      Store.merge(list);
      // anything newer here, including work done while signed out or offline, goes up
      Store.raw().forEach(function (mine) {
        var other = theirs[mine.id];
        if (!other || (other.updatedAt || 0) < mine.updatedAt) push(mine);
      });
      if (state.status !== "in") { state.status = "in"; notify(); }
    }, function (e) {
      state.status = denied(e) ? "denied" : "error";
      state.message = reason(e);
      notify();
    });
  }
  Store.onLocalChange(function (job) { if (state.status === "in") push(job); });

  // ---------- visits ----------
  function refreshViews() {
    if (!state.user || state.views === "loading") return;
    state.views = "loading";
    notify();
    window.firebase.firestore().collection("showcase_visits").orderBy("at", "desc").limit(VIEW_LIMIT).get().then(function (snap) {
      var mine = {};
      Store.raw().forEach(function (j) { mine[j.tag] = true; });
      var next = {};
      snap.docs.forEach(function (doc) {
        var v = doc.data(), match = /^(pf|rv|rd)-(.+)$/.exec(String(v.k || ""));
        if (!match || !mine[match[2]]) return;
        var at = v.at && v.at.toMillis ? v.at.toMillis() : 0;
        var row = next[match[2]] || (next[match[2]] = { pf: 0, rv: 0, rd: 0, last: 0 });
        row[match[1]]++;
        if (at > row.last) row.last = at;
      });
      views = next;
      viewsAt = Date.now();
      state.views = "ok";
      set(CACHE, JSON.stringify(views));
      // reading these proves this is the owner, so the owner's own clicks shouldn't count as visits
      set(MINE, "1");
      notify();
    }, function (e) {
      state.views = denied(e) ? "denied" : "error";
      state.message = reason(e);
      notify();
    });
  }

  // ---------- signing in ----------
  function watch(fb) {
    fb.auth().onAuthStateChanged(function (user) {
      if (stopListening) { stopListening(); stopListening = null; }
      jobsRef = null;
      state.user = user;
      if (!user) {
        state.status = "out"; state.views = "idle"; state.message = "";
        views = {};
        unset(SEEN);
        unset(CACHE);
        notify();
        return;
      }
      set(SEEN, "1");
      state.status = "loading";
      notify();
      listen(fb, user);
      refreshViews();
    });
  }
  function start() {
    state.status = "loading";
    notify();
    return loadSdk().then(function (fb) {
      if (!start.watching) { start.watching = true; watch(fb); }
      return fb;
    });
  }

  return {
    state: state,
    RULE: RULE,
    onChange: function (fn) { listeners.push(fn); },
    viewsFor: function (tag) { return views[tag] || null; },
    init: function () {
      if (get(SEEN) || get(LAUNCHPAD_SEEN)) {
        start().catch(function (e) { state.status = "error"; state.message = reason(e); notify(); });
      } else {
        state.status = "out";
      }
      // come back to the tab after a while and the numbers are fresh
      document.addEventListener("visibilitychange", function () {
        if (!document.hidden && state.user && Date.now() - viewsAt > 5 * 60 * 1000) refreshViews();
      });
    },
    signIn: function () {
      start().then(function (fb) {
        var provider = new fb.auth.GoogleAuthProvider();
        return fb.auth().signInWithPopup(provider).catch(function (e) {
          if (e.code === "auth/popup-closed-by-user" || e.code === "auth/cancelled-popup-request") {
            state.status = state.user ? "in" : "out";
            notify();
            return;
          }
          if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") {
            set(SEEN, "1"); // so the page picks the session up on return
            return fb.auth().signInWithRedirect(provider);
          }
          throw e;
        });
      }).catch(function (e) {
        state.status = "error"; state.message = reason(e); notify();
      });
    },
    signOut: function () {
      unset(SEEN);
      loadSdk().then(function (fb) { return fb.auth().signOut(); }).catch(function () {});
    },
    refreshViews: refreshViews
  };
})();
