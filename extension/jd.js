/* Put on a job posting by the side panel's Fit tab: marks each line of the description as a fit,
   a partial fit or a gap. The marks come off when the panel closes or the page is re-read. */
(function () {
  "use strict";
  if (window.__callbackJD) return;

  var COLORS = {
    strong: { tint: "rgba(12, 163, 12, 0.12)", edge: "#0ca30c", label: "✓ Fits" },
    partial: { tint: "rgba(250, 178, 25, 0.18)", edge: "#fab219", label: "~ Partly" },
    gap: { tint: "rgba(208, 59, 59, 0.12)", edge: "#d03b3b", label: "✕ Gap" }
  };
  var marked = [];
  var byLine = {};
  var port = null;

  function norm(s) { return String(s || "").replace(/^[\s•\-–*]+/, "").replace(/\s+/g, " ").trim().toLowerCase(); }
  var BLOCKS = "li,p,h1,h2,h3,h4,h5,h6,dd,dt,td,blockquote,div,section,article,span";
  var INNER_BLOCKS = "li,p,div,ul,ol,h1,h2,h3,h4,h5,h6,table,section,article,blockquote";

  // The smallest element on the page whose text is this line
  function finder() {
    var list = [];
    document.querySelectorAll(BLOCKS).forEach(function (el) {
      if (el.closest("script,style,nav,header,footer,[aria-hidden='true']")) return;
      if (el.querySelector(INNER_BLOCKS) && el.tagName !== "LI" && el.tagName !== "P") return;
      var text = norm(el.textContent);
      if (text.length < 12 || text.length > 3000) return;
      list.push({ el: el, text: text });
    });
    return function (line) {
      var want = norm(line);
      if (want.length < 12) return null;
      var head = want.slice(0, 80);
      var best = null;
      list.forEach(function (c) {
        if (c.text.length > want.length * 1.8 + 40) return;
        if (c.text === want || c.text.indexOf(head) >= 0) {
          if (!best || c.text.length < best.text.length) best = c;
        }
      });
      return best && best.el;
    };
  }

  function clear() {
    marked.forEach(function (m) {
      if (m.style == null) m.el.removeAttribute("style"); else m.el.setAttribute("style", m.style);
      if (m.title == null) m.el.removeAttribute("title"); else m.el.setAttribute("title", m.title);
      m.el.removeAttribute("data-callback-fit");
    });
    marked = [];
    byLine = {};
  }

  // lines: [{ i, text, verdict, note }]
  function mark(lines) {
    clear();
    var find = finder();
    var count = 0;
    lines.forEach(function (l) {
      var c = COLORS[l.verdict];
      if (!c) return;
      var el = find(l.text);
      if (!el || el.hasAttribute("data-callback-fit")) return;
      marked.push({ el: el, style: el.getAttribute("style"), title: el.getAttribute("title") });
      el.setAttribute("data-callback-fit", l.verdict);
      el.style.setProperty("background-color", c.tint, "important");
      el.style.setProperty("box-shadow", "inset 3px 0 0 " + c.edge, "important");
      el.style.setProperty("border-radius", "3px");
      el.style.setProperty("padding-left", "6px", "important");
      el.setAttribute("title", c.label + (l.note ? ": " + l.note : ""));
      byLine[l.i] = el;
      count++;
    });
    if (!port) {
      try {
        port = chrome.runtime.connect({ name: "callback-jd" });
        port.onDisconnect.addListener(function () { void chrome.runtime.lastError; port = null; clear(); });
      } catch (e) {}
    }
    return count;
  }

  function show(i) {
    var el = byLine[i];
    if (!el) return false;
    el.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    el.animate && el.animate([{ outline: "2px solid " + COLORS[el.getAttribute("data-callback-fit")].edge }, { outline: "2px solid transparent" }], { duration: 1600 });
    return true;
  }

  window.__callbackJD = { mark: mark, clear: clear, show: show };
})();
