(function () {
  "use strict";

  var SOURCE = "LOCAL_ARCH_SCAN_PAGE";
  var EXT_SOURCE = "LOCAL_ARCH_SCAN_CONTENT";

  function injectHook() {
    try {
      var script = document.createElement("script");
      script.src = chrome.runtime.getURL("hook.js");
      script.async = false;
      script.dataset.archScanner = "1";
      (document.documentElement || document.head || document.body).appendChild(script);
      script.remove();
    } catch (error) {
      chrome.runtime.sendMessage({
        type: "arch-scan-record",
        record: {
          type: "inject.error",
          pageUrl: location.href,
          frameUrl: location.href,
          data: { message: String(error && error.message || error) },
          t: Date.now()
        }
      });
    }
  }

  window.addEventListener("message", function (event) {
    if (event.source !== window) return;
    var msg = event.data;
    if (!msg || msg.source !== SOURCE || !msg.record) return;
    chrome.runtime.sendMessage({
      type: "arch-scan-record",
      record: Object.assign({}, msg.record, {
        pageUrl: location.href,
        frameUrl: location.href,
        topLevel: window.top === window
      })
    });
  });

  chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (!message || message.type !== "arch-scan-ping-page") return;
    window.postMessage({ source: EXT_SOURCE, type: "ping" }, "*");
    sendResponse({ ok: true });
  });

  injectHook();
})();
