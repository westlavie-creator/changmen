(() => {
  // src/content/platforms.js
  var PLATFORMS = Object.freeze({
    OB: "OB",
    RAY: "RAY",
    IM: "IM",
    TF: "TF",
    IA: "IA",
    SABA: "SABA",
    PB: "PB",
    IMT: "IMT",
    HGA: "HGA",
    HG: "HG",
    Stake: "Stake",
    /** [changmen 扩展] A8 插件无 */
    Dex: "Dex",
    /** [changmen 扩展] A8 插件无 */
    Polymarket: "Polymarket"
  });
  var PLATFORM_LIST = Object.values(PLATFORMS);

  // src/content/pb/hosts.js
  var PB_HOST_RE = /(^|\.)(part888|ps3838)\.com$/i;
  function isPbSportsHost(hostname = location.hostname) {
    if (PB_HOST_RE.test(String(hostname || ""))) return true;
    try {
      if (window !== window.top && PB_HOST_RE.test(String(window.top.location.hostname || "")))
        return true;
    } catch {
    }
    return false;
  }

  // src/pb-ws-observe.js
  function isPbWsSocketOpen(s) {
    if (!s || typeof s !== "object") return false;
    if (s.phase === "ws_closed" || s.phase === "off" || s.phase === "hook_stop") return false;
    if (s.via === "closed") return false;
    if (Number(s.readyState) === 3) return false;
    return s.connected === true || Number(s.readyState) === 1 || s.phase === "connected";
  }
  function isPbWsObserveLive(s) {
    if (!s || typeof s !== "object") return false;
    if (s.phase === "ws_closed" || s.phase === "off" || s.phase === "hook_stop") return false;
    if (s.via === "closed") return false;
    if (Number(s.readyState) === 3) return false;
    if (isPbWsSocketOpen(s)) return true;
    const t = String(s.lastType || "");
    return Number(s.frameCount) > 0 && /^(CONNECTED|PING|PONG|UPDATE_|FULL_)/.test(t);
  }

  // src/content/pb/init.js
  var ENABLED_KEY = "pbWsObserveEnabled";
  var SOURCE = "cm-pb-ws";
  var FILTER_KEY = "pbWsFilterMatchMapMl";
  var SS_KEY = "cm-pb-ws-status";
  var listening = false;
  var enabled = true;
  var filterMatchMapMl = true;
  var lastBoard = [];
  var lastPhase = "off";
  var lastStatus = {};
  var ownWs = false;
  function postCmd(cmd, extra = {}) {
    window.postMessage({ source: SOURCE, kind: "cmd", cmd, filterMatchMapMl, ...extra }, "*");
  }
  function publishStatus(status) {
    try {
      chrome.runtime.sendMessage({
        type: "pbWsObserveStatus",
        status: {
          host: location.hostname || (typeof window.top !== "undefined" ? window.top.location.hostname : ""),
          href: location.pathname,
          mode: "hook",
          ...status,
          updatedAt: Date.now()
        }
      }, () => {
        void chrome.runtime.lastError;
      });
    } catch {
    }
  }
  function statusLooksLive(s) {
    if (!s || typeof s !== "object") return false;
    if (isPbWsObserveLive(s)) return true;
    if (s.socketSeen === true) return true;
    if (Number(s.frameCount) > 0) return true;
    if (s.lastType) return true;
    if (Array.isArray(s.latestOdds) && s.latestOdds.length) return true;
    return false;
  }
  function ingestHookStatus(data, fromSession) {
    if (!data || data.source !== SOURCE) return;
    if (data.kind && data.kind !== "status") return;
    const clearClose = data.phase === "hooked" || data.phase === "connected" || data.phase === "hook_start";
    const status = {
      running: enabled,
      socketSeen: data.socketSeen === true,
      readyState: data.readyState,
      phase: data.phase || "hook",
      vssid: data.vssid || "",
      frameCount: data.frameCount,
      lastType: data.lastType || "",
      lastDestination: data.lastDestination || "",
      lastClose: clearClose ? null : data.lastClose,
      lastError: clearClose ? "" : data.lastClose ? `page_ws_close ${data.lastClose.code}` : "",
      subscribedOut: data.subscribedOut,
      inboundDest: data.inboundDest,
      inboundTypeCount: data.inboundTypeCount,
      checklist: data.checklist,
      filterMatchMapMl: data.filterMatchMapMl,
      via: data.via
    };
    if (data.connected === true) status.connected = true;
    else if (data.connected === false && data.socketSeen === true) status.connected = false;
    const incomingWs = isPbWsObserveLive({ ...status, lastType: data.lastType, frameCount: data.frameCount });
    if (!fromSession) {
      if (incomingWs || data.connected === true) ownWs = true;
      else if (data.connected === false || data.phase === "ws_closed" || data.phase === "hook_stop" || data.phase === "off" || data.via === "closed") {
        ownWs = false;
      }
    }
    const keepWsBoard = ownWs && !incomingWs && Array.isArray(lastBoard) && lastBoard.length;
    if (Array.isArray(data.latestOdds) && !keepWsBoard) {
      status.latestOdds = data.latestOdds;
      lastBoard = data.latestOdds;
    } else {
      status.latestOdds = lastBoard;
    }
    if (keepWsBoard) {
      if (lastStatus.lastType) status.lastType = lastStatus.lastType;
      if (lastStatus.connected === true) status.connected = true;
      if (lastStatus.readyState != null) status.readyState = lastStatus.readyState;
      if (lastStatus.phase === "connected") status.phase = "connected";
      if (lastStatus.frameCount != null) status.frameCount = lastStatus.frameCount;
      if (lastStatus.phase === "connected") lastPhase = "connected";
    } else if (typeof data.phase === "string" && data.phase) {
      lastPhase = data.phase;
    }
    lastStatus = { ...status, latestOdds: lastBoard, phase: lastPhase };
    if (statusLooksLive(lastStatus) || data.connected === true) {
      publishStatus(status);
    }
  }
  function onPageMessage(ev) {
    if (ev.source !== window) return;
    ingestHookStatus(ev.data, false);
  }
  function pollSessionStatus() {
    try {
      if (ownWs || isPbWsObserveLive(lastStatus)) return;
      const raw = sessionStorage.getItem(SS_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!data || typeof data !== "object") return;
      ingestHookStatus({ source: SOURCE, kind: "status", ...data }, true);
    } catch {
    }
  }
  function ensureListening() {
    if (listening) return;
    listening = true;
    window.addEventListener("message", onPageMessage);
  }
  async function ensureObserve(on) {
    enabled = on;
    ensureListening();
    if (!on) {
      lastBoard = [];
      lastPhase = "off";
      lastStatus = { running: false, connected: false, phase: "off", latestOdds: [] };
      ownWs = false;
      postCmd("stop");
      publishStatus({ running: false, connected: false, phase: "off", latestOdds: [] });
      console.info("[PB WS] observe stopped (hook)");
      return;
    }
    chrome.runtime.sendMessage(
      { type: "setTab", uuid: Date.now().toString(), data: { key: PLATFORMS.PB } },
      () => {
        void chrome.runtime.lastError;
      }
    );
    postCmd("start", { filterMatchMapMl });
    pollSessionStatus();
    console.info("[PB WS] observe start (hook page WS, light)");
  }
  function initPbWsObserve() {
    if (!isPbSportsHost()) return;
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type !== "pbWsObserveBoardGet") return false;
      if (!ownWs || !isPbWsObserveLive(lastStatus)) {
        return false;
      }
      sendResponse({
        ...lastStatus,
        latestOdds: lastBoard,
        phase: lastPhase
      });
      return true;
    });
    chrome.storage.local.get([ENABLED_KEY, FILTER_KEY], (items) => {
      if (typeof items?.[FILTER_KEY] === "boolean") {
        filterMatchMapMl = items[FILTER_KEY];
      }
      void ensureObserve(items?.[ENABLED_KEY] !== false);
      setInterval(pollSessionStatus, 400);
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes[FILTER_KEY]) {
        filterMatchMapMl = changes[FILTER_KEY].newValue !== false;
        if (enabled) postCmd("setFilter", { filterMatchMapMl });
      }
      if (changes[ENABLED_KEY]) {
        void ensureObserve(changes[ENABLED_KEY].newValue !== false);
      }
    });
  }

  // src/content/pb-bridge-entry.js
  initPbWsObserve();
})();
