/**
 * MAIN world：旁路官网 yewuws2。赔率在 Worker 里解压后 postMessage 到页面，
 * 只听不另开第二条连接（同 token 第二条往往只能看到心跳，盘口仍是 H）。
 */
(function obSportWsHookMain() {
  if (window.__CM_OB_SPORT_WS_HOOK__)
    return;
  window.__CM_OB_SPORT_WS_HOOK__ = true;

  let helperPage = false;
  try {
    if (/cm_ob_sport_ws/i.test(`${location.pathname}${location.search}${location.hash}`))
      sessionStorage.setItem("cm_ob_sport_ws", "1");
    helperPage = sessionStorage.getItem("cm_ob_sport_ws") === "1"
      || new URLSearchParams(location.search).get("cm_ob_sport_ws") === "1";
  }
  catch { /* ignore */ }
  if (helperPage) {
    const Dummy = function WorkerDummy() {};
    Dummy.prototype.postMessage = function () {};
    Dummy.prototype.terminate = function () {};
    Dummy.prototype.addEventListener = function () {};
    Dummy.prototype.removeEventListener = function () {};
    window.Worker = Dummy;
    return;
  }

  const SOURCE = "cm-ob-sport-ws";
  const KEEP = new Set(["", "C105", "C102", "C103", "C101", "C109", "C302", "C303"]);

  function looksPush(url) {
    return /yewuws2|\/push\?requestId=/i.test(String(url || ""));
  }

  function cmdOf(data) {
    if (!data)
      return "";
    if (typeof data === "string") {
      const m = data.match(/"(?:cmd|CMD)"\s*:\s*"([^"]+)"/);
      return m ? String(m[1] || "").toUpperCase() : "";
    }
    if (typeof data === "object") {
      const row = data;
      const nested = row.data && typeof row.data === "object" ? row.data : null;
      return String(row.cmd || row.CMD || nested?.cmd || nested?.CMD || "").toUpperCase();
    }
    return "";
  }

  function shouldKeep(data) {
    return KEEP.has(cmdOf(data));
  }

  function post(kind, data) {
    if (kind === "message" && !shouldKeep(data))
      return;
    const payload = { source: SOURCE, kind, data };
    try {
      window.postMessage(payload, "*");
    }
    catch { /* ignore */ }
    if (window.top && window.top !== window) {
      try {
        window.top.postMessage(payload, "*");
      }
      catch { /* ignore */ }
    }
  }

  function tapSocket(ws, url) {
    if (!ws || ws.__cmObSportTapped)
      return;
    if (url && !looksPush(url) && ws.url && !looksPush(ws.url))
      return;
    ws.__cmObSportTapped = true;
    post("open", { url: String(ws.url || url || "") });
    ws.addEventListener("message", (ev) => {
      const data = ev.data;
      if (typeof data === "string") {
        post("message", data);
        return;
      }
      if (typeof Blob !== "undefined" && data instanceof Blob) {
        void data.text().then(text => post("message", text));
        return;
      }
      if (typeof ArrayBuffer !== "undefined" && (data instanceof ArrayBuffer || ArrayBuffer.isView(data))) {
        post("message", new TextDecoder().decode(data));
        return;
      }
      post("message", data);
    });
    ws.addEventListener("close", () => {
      post("close", { url: String(ws.url || "") });
    });
  }

  const NativeWS = window.WebSocket;
  if (NativeWS) {
    window.WebSocket = function (url, protocols) {
      const ws = protocols ? new NativeWS(url, protocols) : new NativeWS(url);
      if (looksPush(url))
        tapSocket(ws, url);
      return ws;
    };
    window.WebSocket.prototype = NativeWS.prototype;
    window.WebSocket.prototype.constructor = window.WebSocket;
    Object.keys(NativeWS).forEach((k) => {
      try {
        window.WebSocket[k] = NativeWS[k];
      }
      catch { /* ignore */ }
    });
  }

  const NativeWorker = window.Worker;
  if (NativeWorker) {
    window.Worker = function (url, opts) {
      const worker = opts ? new NativeWorker(url, opts) : new NativeWorker(url);
      if (/ws-worker/i.test(String(url || ""))) {
        worker.addEventListener("message", (ev) => {
          post("message", ev.data);
        });
        post("open", { url: String(url || "ws-worker") });
      }
      return worker;
    };
    window.Worker.prototype = NativeWorker.prototype;
    window.Worker.prototype.constructor = window.Worker;
  }
})();
