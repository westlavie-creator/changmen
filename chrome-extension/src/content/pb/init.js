/**
 * 平博页：挂接官网 sports-websocket 观测。
 * 仅当本页主机命中投注账号 referer/gateway 时启动（不改 A8 Check）。
 */
import { PLATFORMS } from "../platforms.js";
import {
  normalizePbAccountHosts,
  pageMatchesPbAccountHosts,
  PB_ACCOUNT_HOSTS_KEY,
} from "./hosts.js";
import { isPbWsObserveLive } from "../../pb-ws-observe.js";

const ENABLED_KEY = "pbWsObserveEnabled";
const SOURCE = "cm-pb-ws";
const FILTER_KEY = "pbWsFilterMatchMapMl";
const SS_KEY = "cm-pb-ws-status";

let listening = false;
/** 默认开：storage 未写或非 false 即观测 */
let enabled = true;
/** 默认开：只显示比赛/地图独赢 */
let filterMatchMapMl = true;
/** 页内 hook 最新板；主站 pbWsObserveGet 走这里，避开 storage 竞态 */
let lastBoard = [];
let lastPhase = "off";
/** 本 frame 最近一次 status（侧栏 / pbWsObserveGet 走内存，不信被其它 frame 写脏的 storage） */
let lastStatus = {};
/** 仅本 frame 的 hook 报过 sports-websocket 才答 BoardGet，避免顶栏用 sessionStorage 冒充 */
let ownWs = false;
/** 投注账号 referer/gateway 主机 */
let accountHosts = [];

function postCmd(cmd, extra = {}) {
  window.postMessage({ source: SOURCE, kind: "cmd", cmd, filterMatchMapMl, hosts: accountHosts, ...extra }, "*");
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
        updatedAt: Date.now(),
      },
    }, () => {
      void chrome.runtime.lastError;
    });
  } catch {
    /* ignore */
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
  /** @type {Record<string, unknown>} */
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
    lastError: clearClose
      ? ""
      : data.lastClose
        ? `page_ws_close ${data.lastClose.code}`
        : "",
    subscribedOut: data.subscribedOut,
    inboundDest: data.inboundDest,
    inboundTypeCount: data.inboundTypeCount,
    checklist: data.checklist,
    filterMatchMapMl: data.filterMatchMapMl,
    via: data.via,
  };
  if (data.connected === true) status.connected = true;
  else if (data.connected === false && data.socketSeen === true) status.connected = false;
  const incomingWs = isPbWsObserveLive({ ...status, lastType: data.lastType, frameCount: data.frameCount });
  if (!fromSession) {
    if (incomingWs || data.connected === true) ownWs = true;
    else if (
      data.connected === false
      || data.phase === "ws_closed"
      || data.phase === "hook_stop"
      || data.phase === "off"
      || data.via === "closed"
    ) {
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
    /* ignore */
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
    () => { void chrome.runtime.lastError; },
  );
  // 勿 publish hook_start：空 iframe 会把侧栏钉在「连接中」
  postCmd("start", { filterMatchMapMl });
  pollSessionStatus();
  console.info("[PB WS] observe start (hook page WS, light)");
}

function listenObserveMessages() {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "pbWsObserveBoardGet") return false;
    // 只有本 frame 自己的 sports-websocket 活着才答。带 euro 板的顶栏抢答会盖掉 UPDATE_ODDS。
    if (!ownWs || !isPbWsObserveLive(lastStatus)) {
      return false;
    }
    sendResponse({
      ...lastStatus,
      latestOdds: lastBoard,
      phase: lastPhase,
    });
    return true;
  });
}

function startObserveFromStorage() {
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

/**
 * @returns {void}
 */
export function initPbWsObserve() {
  listenObserveMessages();

  let started = false;
  const boot = () => {
    if (started) return true;
    if (!pageMatchesPbAccountHosts(accountHosts)) return false;
    started = true;
    startObserveFromStorage();
    return true;
  };

  const applyHosts = (raw) => {
    accountHosts = normalizePbAccountHosts(raw);
    boot();
  };

  chrome.storage.local.get([PB_ACCOUNT_HOSTS_KEY], (items) => {
    applyHosts(items?.[PB_ACCOUNT_HOSTS_KEY]);
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[PB_ACCOUNT_HOSTS_KEY]) return;
    applyHosts(changes[PB_ACCOUNT_HOSTS_KEY].newValue);
  });
}
