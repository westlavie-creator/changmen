/**
 * part888 页：挂接官网 sports-websocket 观测
 * 只收 status 摘要（含 latestOdds），灌主站影子价；扩展侧栏不再画赔率板。
 */
import { PLATFORMS } from "../platforms.js";
import { isPbSportsHost } from "./hosts.js";

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
  if (s.connected === true || Number(s.readyState) === 1) return true;
  if (s.socketSeen === true) return true;
  if (Number(s.frameCount) > 0) return true;
  if (s.lastType) return true;
  if (Array.isArray(s.latestOdds) && s.latestOdds.length) return true;
  return false;
}

function ingestHookStatus(data) {
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
  };
  if (data.connected === true) status.connected = true;
  else if (data.connected === false && data.socketSeen === true) status.connected = false;
  if (Array.isArray(data.latestOdds)) {
    status.latestOdds = data.latestOdds;
    lastBoard = data.latestOdds;
  }
  if (typeof data.phase === "string" && data.phase) lastPhase = data.phase;
  lastStatus = { ...status, latestOdds: lastBoard, phase: lastPhase };
  if (statusLooksLive(lastStatus) || data.connected === true) {
    publishStatus(status);
  }
}

function onPageMessage(ev) {
  if (ev.source !== window) return;
  ingestHookStatus(ev.data);
}

function pollSessionStatus() {
  try {
    const raw = sessionStorage.getItem(SS_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return;
    ingestHookStatus({ source: SOURCE, kind: "status", ...data });
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

/**
 * @returns {void}
 */
export function initPbWsObserve() {
  if (!isPbSportsHost()) return;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "pbWsObserveBoardGet") return false;
    // 空 frame 不抢答，否则 tabs.sendMessage 先收到 hook_start，侧栏一直「连接中」
    if (!statusLooksLive(lastStatus) && !(Array.isArray(lastBoard) && lastBoard.length)) {
      return false;
    }
    sendResponse({
      ...lastStatus,
      latestOdds: lastBoard,
      phase: lastPhase,
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
      // 缺省 / 非 false → 开（默认开观测）
      void ensureObserve(changes[ENABLED_KEY].newValue !== false);
    }
  });
}
