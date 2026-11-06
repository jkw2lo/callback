/* Captures a posting when you right-click it (or click the toolbar icon) and opens the
   board with the details filled in for you to check. Saving happens on the board, which is
   already signed in, so this extension never holds an account or a copy of your jobs.

   activeTab lets it read only the tab you just acted on, at the moment you acted. */

const LIVE_BOARD = "https://jkw2lo.github.io/callback/";

// For testing against a local copy: chrome.storage.local.set({ boardUrl: "http://127.0.0.1:8765/callback/" })
async function boardUrl() {
  const { boardUrl: url } = await chrome.storage.local.get("boardUrl");
  return url || LIVE_BOARD;
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "add", title: "Add to Callback", contexts: ["page", "selection", "frame"] });
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

chrome.contextMenus.onClicked.addListener((info, tab) => capture(info, tab));
chrome.action.onClicked.addListener((tab) => capture(null, tab));

// Only the board may collect a draft, and each draft is handed over once
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (!message || message.type !== "take-draft") return false;
  (async () => {
    const url = await boardUrl();
    if (!sender.url || !sender.url.startsWith(url)) return reply({ draft: null });
    const { draft } = await chrome.storage.session.get("draft");
    await chrome.storage.session.remove("draft");
    reply({ draft: draft || null });
  })();
  return true;
});
