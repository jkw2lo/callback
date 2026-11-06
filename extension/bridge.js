/* Runs on the board page and passes drafts from the extension to it. */
(function () {
  "use strict";

  var pageReady = false;

  function deliver() {
    chrome.runtime.sendMessage({ type: "take-draft" }, function (answer) {
      if (chrome.runtime.lastError || !answer || !answer.draft) return;
      window.postMessage({ source: "callback-ext", type: "draft", draft: answer.draft }, location.origin);
    });
  }

  window.addEventListener("message", function (e) {
    if (e.source !== window || e.origin !== location.origin || !e.data) return;
    if (e.data.source === "callback-page" && e.data.type === "ready") {
      pageReady = true;
      deliver();
    }
  });

  chrome.runtime.onMessage.addListener(function (message) {
    if (message && message.type === "draft-ready" && pageReady) deliver();
  });

  // Whichever loads second gets the other's attention: the page answers this with "ready"
  window.postMessage({ source: "callback-ext", type: "hello" }, location.origin);
})();
