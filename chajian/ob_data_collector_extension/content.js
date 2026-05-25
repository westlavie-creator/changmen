(function () {
  "use strict";

  const PAGE_SOURCE = "OB_DATA_COLLECTOR_PAGE";

  function injectScript(file) {
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL(file);
    script.async = false;
    script.dataset.obCollector = file;
    (document.documentElement || document.head || document.body).appendChild(script);
    script.remove();
  }

  try {
    injectScript("core.js");
    injectScript("hook.js");
  } catch (error) {
    chrome.runtime.sendMessage({
      type: "ob-collector-record",
      record: {
        type: "inject.error",
        pageUrl: location.href,
        frameUrl: location.href,
        t: Date.now(),
        data: { message: String(error && error.message || error) }
      }
    });
  }

  window.addEventListener("message", event => {
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg || msg.source !== PAGE_SOURCE || !msg.record) return;
    chrome.runtime.sendMessage({
      type: "ob-collector-record",
      record: Object.assign({}, msg.record, {
        pageUrl: location.href,
        frameUrl: location.href,
        topLevel: window.top === window
      })
    });
  });
})();
