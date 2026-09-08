(() => {
  // src/content/ob-sport-ws.js
  var socket = null;
  var tapOnly = false;
  var hookLive = false;
  var ownSocket = false;
  var pendingSend = [];
  var KEEP_CMD = /^(C105|C102|C103|C101|C109|C302|C303)$/;
  var HELPER_PORT = "ob-sport-ws-helper";
  function emit(kind, extra = {}) {
    try {
      chrome.runtime.sendMessage({ type: "obSportWsEvent", kind, ...extra });
    } catch {
    }
  }
  function cmdOfFrame(data) {
    if (data == null)
      return "";
    if (typeof data === "object") {
      const row = data;
      const nested = row.data && typeof row.data === "object" ? row.data : null;
      return String(row.cmd || row.CMD || nested?.cmd || nested?.CMD || "").toUpperCase();
    }
    if (typeof data !== "string")
      return "";
    try {
      const o = JSON.parse(data);
      const nested = o && typeof o === "object" && o.data && typeof o.data === "object" ? o.data : null;
      return String(o?.cmd || o?.CMD || nested?.cmd || nested?.CMD || "").toUpperCase();
    } catch {
      return "";
    }
  }
  function keepFrame(data) {
    const cmd = cmdOfFrame(data);
    if (!cmd)
      return true;
    return KEEP_CMD.test(cmd);
  }
  function markHelperFromLocation() {
    try {
      if (/cm_ob_sport_ws/i.test(`${location.pathname}${location.search}${location.hash}`))
        sessionStorage.setItem("cm_ob_sport_ws", "1");
    } catch {
    }
  }
  function isHelperPage() {
    markHelperFromLocation();
    try {
      if (sessionStorage.getItem("cm_ob_sport_ws") === "1")
        return true;
    } catch {
    }
    try {
      return /cm_ob_sport_ws/i.test(`${location.pathname}${location.search}${location.hash}`);
    } catch {
      return false;
    }
  }
  function isHelperFrame() {
    if (isHelperPage())
      return true;
    if (window === window.top)
      return false;
    try {
      return String(document.referrer || "").startsWith("chrome-extension://");
    } catch {
      return false;
    }
  }
  function closeSocket() {
    if (!socket)
      return;
    try {
      socket.close();
    } catch {
    }
    socket = null;
  }
  function flushPendingSend(target) {
    if (!target || target.readyState !== 1)
      return;
    const queued = pendingSend;
    pendingSend = [];
    for (const text of queued) {
      try {
        target.send(text);
      } catch {
      }
    }
  }
  function openSocket(url) {
    closeSocket();
    tapOnly = false;
    ownSocket = true;
    let next;
    try {
      next = new WebSocket(url);
    } catch (err) {
      ownSocket = false;
      emit("error", { message: err instanceof Error ? err.message : String(err) });
      return;
    }
    socket = next;
    next.addEventListener("open", () => {
      if (socket !== next)
        return;
      emit("open");
      flushPendingSend(next);
    });
    next.addEventListener("message", (ev) => {
      if (socket !== next)
        return;
      const data = ev.data;
      if (typeof data === "string") {
        if (keepFrame(data))
          emit("message", { data });
        return;
      }
      if (typeof Blob !== "undefined" && data instanceof Blob) {
        void data.text().then((text) => {
          if (socket === next && keepFrame(text))
            emit("message", { data: text });
        });
        return;
      }
      if (typeof ArrayBuffer !== "undefined" && (data instanceof ArrayBuffer || ArrayBuffer.isView(data))) {
        const text = new TextDecoder().decode(data);
        if (keepFrame(text))
          emit("message", { data: text });
      }
    });
    next.addEventListener("error", () => {
      if (socket !== next)
        return;
      emit("error", { message: "ob-sport tab ws error" });
    });
    next.addEventListener("close", (ev) => {
      if (socket !== next)
        return;
      socket = null;
      ownSocket = false;
      emit("close", { code: ev.code, reason: ev.reason });
    });
  }
  function emitTapOpen() {
    tapOnly = true;
    ownSocket = false;
    closeSocket();
    emit("open");
    emit("tap", { tapOnly: true });
  }
  function installHookBridge() {
    window.addEventListener("message", (ev) => {
      const row = ev.data;
      if (!row || row.source !== "cm-ob-sport-ws")
        return;
      if (ownSocket)
        return;
      const kind = String(row.kind || "");
      if (kind === "open") {
        hookLive = true;
        emitTapOpen();
        return;
      }
      if (kind === "message") {
        hookLive = true;
        let data = row.data;
        if (data && typeof data === "object" && !(typeof Blob !== "undefined" && data instanceof Blob)) {
          try {
            data = JSON.stringify(data);
          } catch {
            return;
          }
        }
        if (!keepFrame(data))
          return;
        emit("message", { data });
        return;
      }
      if (kind === "close") {
        hookLive = false;
        emit("close", row.data || {});
      }
    });
  }
  function applyControl(cmd, message) {
    if (cmd === "tap") {
      tapOnly = true;
      if (hookLive)
        emitTapOpen();
      return { ok: true, tapOnly: true, hookLive };
    }
    if (cmd === "open")
      openSocket(String(message.url || ""));
    else if (cmd === "send" && !tapOnly) {
      const text = String(message.payload || "");
      if (socket?.readyState === 1)
        socket.send(text);
      else
        pendingSend.push(text);
    } else if (cmd === "close") {
      tapOnly = false;
      ownSocket = false;
      pendingSend = [];
      closeSocket();
    }
    return { ok: true };
  }
  function installHelperPort() {
    let port;
    try {
      port = chrome.runtime.connect({ name: HELPER_PORT });
    } catch {
      setTimeout(installHelperPort, 400);
      return;
    }
    port.onMessage.addListener((msg) => {
      if (!msg || typeof msg !== "object")
        return;
      applyControl(String(msg.cmd || ""), msg);
    });
    port.onDisconnect.addListener(() => {
      setTimeout(installHelperPort, 400);
    });
  }
  function installObSportWsListener() {
    const helper = isHelperFrame();
    if (window !== window.top && !helper)
      return;
    if (helper) {
      try {
        document.title = "changmen OB-WS";
      } catch {
      }
    }
    installHookBridge();
    if (helper)
      installHelperPort();
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type !== "obSportWsControl")
        return false;
      sendResponse(applyControl(String(message.cmd || ""), message));
      return true;
    });
  }

  // src/content/ob-sport-ws-page.js
  installObSportWsListener();
})();
