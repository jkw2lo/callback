/* Captures a posting when you right-click it and opens the board with the details filled in
   for you to check. Saving happens on the board, which is already signed in, so this extension
   never holds an account. It keeps only a short list of your jobs (company, role, link) so the
   side panel can offer the right tracked link.

   The toolbar icon opens the side panel, which fills application forms: see panel.js and fill.js.

   activeTab lets it read the tab you just acted on, at the moment you acted. */

const LIVE_BOARD = "https://jkw2lo.github.io/callback/";

// For testing against a local copy: chrome.storage.local.set({ boardUrl: "http://127.0.0.1:8765/callback/" })
async function boardUrl() {
  const { boardUrl: url } = await chrome.storage.local.get("boardUrl");
  return url || LIVE_BOARD;
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "add", title: "Add to Callback", contexts: ["page", "selection", "frame"] });
    chrome.contextMenus.create({ id: "fill", title: "Fill this application", contexts: ["page", "frame", "editable"] });
  });
});

async function extract(tabId, frameId) {
  try {
    const [hit] = await chrome.scripting.executeScript({ target: { tabId, frameIds: [frameId] }, files: ["extract.js"] });
    return (hit && hit.result) || null;
  } catch (e) {
    return null; // Chrome's own pages, the Web Store and some embedded frames can't be read
  }
}

// A posting embedded from a job portal lives in a frame, and has the better details
function combine(top, frame) {
  if (!frame || (frame.jd || "").length < 200) return top;
  if (!top) return frame;
  return {
    company: frame.company || top.company,
    title: frame.title || top.title,
    location: frame.location || top.location,
    pay: frame.pay || top.pay,
    jd: frame.jd
  };
}

async function capture(info, tab) {
  if (!tab || !tab.id) return;
  const top = await extract(tab.id, 0);
  const frame = info && info.frameId ? await extract(tab.id, info.frameId) : null;
  const found = combine(top, frame) || {};
  const pageUrl = /^https?:/.test(tab.url || "") ? tab.url : "";
  const draft = {
    company: found.company || "",
    title: found.title || (top ? "" : tab.title || ""),
    location: found.location || "",
    pay: found.pay || "",
    url: pageUrl,
    // Chrome hands over a selection even from a page it can't read, without its line breaks
    jd: found.jd || (info && info.selectionText) || ""
  };
  await chrome.storage.session.set({ draft });
  await showBoard(tab);
}

// "Save as Applied": hand the job to the board without taking you away from the page you're on
async function saveQuietly(draft) {
  const text = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");
  const clean = {
    company: text(draft.company, 120), title: text(draft.title, 160), location: text(draft.location, 120),
    pay: text(draft.pay, 80), url: /^https?:\/\//i.test(draft.url || "") ? text(draft.url, 2000) : "", jd: text(draft.jd, 30000),
    tag: /^[a-z0-9-]{1,16}$/i.test(draft.tag || "") ? draft.tag : "",
    fit: draft.fit && typeof draft.fit === "object" ? draft.fit : null,
    autoSave: true
  };
  await chrome.storage.session.set({ draft: clean });
  const url = await boardUrl();
  const [open] = await chrome.tabs.query({ url: url + "*" });
  if (open) {
    try { await chrome.tabs.sendMessage(open.id, { type: "draft-ready" }); }
    catch (e) { await chrome.tabs.reload(open.id); }
    return;
  }
  await chrome.tabs.create({ url, active: false });
}

async function showBoard(fromTab) {
  const url = await boardUrl();
  const [open] = await chrome.tabs.query({ url: url + "*" });
  if (open) {
    await chrome.tabs.update(open.id, { active: true });
    await chrome.windows.update(open.windowId, { focused: true });
    try {
      await chrome.tabs.sendMessage(open.id, { type: "draft-ready" });
    } catch (e) {
      await chrome.tabs.reload(open.id); // opened before the extension was installed
    }
    return;
  }
  await chrome.tabs.create({ url, index: fromTab.index + 1, windowId: fromTab.windowId });
}

// Chrome only opens a side panel straight from your click, so nothing can come before this.
// The click also lets the form script into a site that isn't one of the known job portals.
function openPanel(tab) {
  if (!tab || !tab.id) return;
  chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
  chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ["fill.js"] }).catch(() => {});
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "fill") openPanel(tab);
  else capture(info, tab);
});
chrome.action.onClicked.addListener(openPanel);

// A short list for the side panel, sent by the board. Whatever arrives is checked, since the
// panel shows these words and puts these links into forms.
function cleanJobs(list) {
  const text = (v, max) => String(v == null ? "" : v).slice(0, max);
  const web = (v) => (/^https?:\/\//i.test(String(v || "")) ? text(v, 2000) : "");
  return (Array.isArray(list) ? list : []).slice(0, 1000).map((j) => {
    const tag = text(j && j.tag, 16);
    if (!/^[a-z0-9-]+$/i.test(tag)) return null;
    return {
      tag,
      company: text(j.company, 120),
      title: text(j.title, 160),
      url: web(j.url),
      stage: text(j.stage, 20),
      updatedAt: Number(j.updatedAt) || 0,
      links: { home: web(j.links && j.links.home), resume: web(j.links && j.links.resume) }
    };
  }).filter(Boolean);
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (!message) return false;
  if (message.type === "board-jobs") {
    boardUrl().then((url) => {
      if (sender.url && sender.url.startsWith(url)) chrome.storage.local.set({ boardJobs: cleanJobs(message.jobs) });
    });
    return false;
  }
  // The board says what it saved, for the side panel
  if (message.type === "board-saved") {
    boardUrl().then((url) => {
      if (!sender.url || !sender.url.startsWith(url) || !message.saved) return;
      const s = message.saved;
      const text = (v, max) => String(v == null ? "" : v).slice(0, max);
      chrome.storage.session.set({ lastSaved: { outcome: text(s.outcome, 10), company: text(s.company, 120), title: text(s.title, 160), stage: text(s.stage, 20), tag: text(s.tag, 16), at: Date.now() } });
    });
    return false;
  }
  if (message.type === "save-applied" || message.type === "show-board") {
    if (!sender.url || !sender.url.startsWith(chrome.runtime.getURL(""))) return false;
    if (message.type === "save-applied") saveQuietly(message.draft || {}).then(() => reply({ ok: true }), () => reply({ ok: false }));
    else chrome.tabs.query({ active: true, lastFocusedWindow: true }).then(([tab]) => showBoard(tab || { index: 0 })).then(() => reply({ ok: true }), () => reply({ ok: false }));
    return true;
  }
  // "Add this job" in the side panel
  if (message.type === "capture-tab") {
    if (!sender.url || !sender.url.startsWith(chrome.runtime.getURL(""))) return false;
    chrome.tabs.get(message.tabId).then((tab) => capture(null, tab)).then(() => reply({ ok: true }), () => reply({ ok: false }));
    return true;
  }
  if (message.type !== "take-draft") return false;
  // Only the board may collect a draft, and each draft is handed over once
  (async () => {
    const url = await boardUrl();
    if (!sender.url || !sender.url.startsWith(url)) return reply({ draft: null });
    const { draft } = await chrome.storage.session.get("draft");
    await chrome.storage.session.remove("draft");
    reply({ draft: draft || null });
  })();
  return true;
});
