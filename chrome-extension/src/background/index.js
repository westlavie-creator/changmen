/**
 * Gamebet Chrome 扩展 — Service Worker
 * 对齐 A8 externally_connectable 消息协议（changmen pluginBridge.ts）
 * 存储仅用 chrome.storage.local（Electron loadExtension 无 sync）
 */
import "./electron-storage-polyfill.js";
import {
  initModifyHeaderListener,
  MODIFY_HEADER_KEY,
  applyModifyHeaderRules,
} from "./modify-header.js";
import { axiosRequest } from "./http.js";
import { storageGet, storageSet } from "./storage.js";

const MANIFEST = chrome.runtime.getManifest();

const PB_WS_STATUS_KEY = "pbWsObserve";
const PB_WS_ENABLED_KEY = "pbWsObserveEnabled";
const PB_WS_BOARD_KEY = "pbWsLatestOdds";
const PB_WS_MAX_RECENT = 40;

/**
 * @param {object} frame
 */
async function appendPbWsFrame(frame) {
  // 与 mergePbWsStatus 并发时，勿用过期 cur 盖掉较新的 latestOdds
  const bag = await storageGet([PB_WS_STATUS_KEY, PB_WS_BOARD_KEY]);
  const cur = bag?.[PB_WS_STATUS_KEY] || {};
  const boardCards = bag?.[PB_WS_BOARD_KEY]?.cards;
  const recent = Array.isArray(cur.recent) ? cur.recent.slice() : [];
  recent.push(frame);
  while (recent.length > PB_WS_MAX_RECENT) recent.shift();
  /** @type {Record<string, unknown>} */
  const next = {
    ...cur,
    recent,
    frameCount: (cur.frameCount || 0) + 1,
    lastType: frame?.type || cur.lastType,
    updatedAt: Date.now(),
  };
  if (Array.isArray(boardCards)) next.latestOdds = boardCards;
  await storageSet({ [PB_WS_STATUS_KEY]: next });
}

/**
 * @param {object} status
 */
async function mergePbWsStatus(status) {
  const cur = (await storageGet([PB_WS_STATUS_KEY, PB_WS_BOARD_KEY])) || {};
  const curStatus = cur?.[PB_WS_STATUS_KEY] || {};
  const curBoard = cur?.[PB_WS_BOARD_KEY];
  const incomingClosed =
    status?.phase === "off"
    || status?.phase === "hook_stop"
    || status?.phase === "ws_closed";
  const incomingOpen =
    status?.connected === true || Number(status?.readyState) === 1;
  const next = {
    ...curStatus,
    ...status,
    recent: curStatus.recent || [],
    updatedAt: Date.now(),
  };
  // 多 frame：顶栏 euro/odds flush 没有 sports WS，不得把 iframe 的已连接打成断开
  if (!incomingClosed && status?.socketSeen !== true && !incomingOpen) {
    if (curStatus.connected === true || Number(curStatus.readyState) === 1) {
      next.connected = true;
      if (Number(curStatus.readyState) === 1) next.readyState = curStatus.readyState;
    } else if (!("connected" in (status || {}))) {
      next.connected = curStatus.connected;
      if (next.readyState == null) next.readyState = curStatus.readyState;
    }
    if (!status?.lastType && curStatus.lastType) {
      next.lastType = curStatus.lastType;
      next.lastDestination = curStatus.lastDestination;
    }
    next.frameCount = Math.max(Number(curStatus.frameCount) || 0, Number(status?.frameCount) || 0);
    const curOut = Array.isArray(curStatus.subscribedOut) ? curStatus.subscribedOut : [];
    const inOut = Array.isArray(status?.subscribedOut) ? status.subscribedOut : [];
    if (curOut.length && inOut.length === 0) {
      next.subscribedOut = curStatus.subscribedOut;
      next.inboundDest = curStatus.inboundDest;
      next.inboundTypeCount = curStatus.inboundTypeCount;
      next.checklist = curStatus.checklist;
    }
  }
  if (incomingClosed) {
    next.connected = false;
    if (status?.readyState != null) next.readyState = status.readyState;
  } else if (incomingOpen) {
    next.connected = true;
  }
  // 勿用 undefined 冲掉已有 latestOdds（部分 status 帧不带盘口板）
  if (!Array.isArray(status?.latestOdds)) {
    if (Array.isArray(curStatus.latestOdds)) next.latestOdds = curStatus.latestOdds;
    else delete next.latestOdds;
  } else {
    const incomingSeq = Number(status.boardSeq) || 0;
    const curSeq = Number(curStatus.boardSeq) || Number(curBoard?.boardSeq) || 0;
    if (incomingSeq && curSeq && incomingSeq < curSeq) {
      next.latestOdds = Array.isArray(curBoard?.cards)
        ? curBoard.cards
        : curStatus.latestOdds;
      next.boardSeq = curSeq;
    }
  }
  // 成功挂接后清掉历史 close，避免弹窗一直显示 close=1006
  if (status?.lastClose == null && (status?.phase === "hooked" || status?.phase === "connected" || status?.connected === true)) {
    next.lastClose = null;
    if (!status.lastError) next.lastError = "";
  }
  const patch = { [PB_WS_STATUS_KEY]: next };
  // 盘口板单独存一份，避免被其它 status 字段合并弄丢
  const seqStale = Number(status.boardSeq) && Number(curStatus.boardSeq) && Number(status.boardSeq) < Number(curStatus.boardSeq);
  const wipeBoard = status?.phase === "off" || status?.phase === "hook_stop";
  const keepIncomingBoard =
    Array.isArray(status?.latestOdds)
    && (wipeBoard || status.latestOdds.length > 0)
    && !seqStale;
  if (keepIncomingBoard) {
    patch[PB_WS_BOARD_KEY] = {
      cards: status.latestOdds,
      updatedAt: Date.now(),
      boardSeq: Number(status.boardSeq) || 0,
    };
  }
  await storageSet(patch);
}

/** @typedef {{ type: string; uuid?: string; url?: string; data?: unknown; options?: TabRequestOptions }} ExternalMessage */
/** @typedef {{ tabId?: number; headers?: Record<string, string>; timeout?: number; withCredentials?: boolean }} TabRequestOptions */

/**
 * @param {ExternalMessage} message
 * @param {number} tabId
 * @returns {Promise<unknown>}
 */
function forwardToTab(message, tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message || "标签页通信失败"));
        return;
      }
      if (response && typeof response === "object" && "response" in response) {
        resolve(response.response);
        return;
      }
      resolve(response);
    });
  });
}

/**
 * @param {ExternalMessage} message
 * @param {(payload: object) => void} reply
 * @param {chrome.runtime.MessageSender} [sender]
 */
async function handleExternalMessage(message, reply, sender) {
  const { type, uuid } = message;

  switch (type) {
      case "GET":
      case "POST":
      case "DELETE":
      case "": {
      const tabId = message.options?.tabId;
      if (tabId) {
        try {
          const response = await forwardToTab(message, tabId);
          reply({ type, uuid, response });
        } catch (err) {
          reply({ type, uuid, response: err });
        }
        return;
      }
      try {
        const response = await axiosRequest(message);
        reply({ type, uuid, response });
      } catch (err) {
        reply({ type, uuid, response: err });
      }
      return;
    }
    case "version":
      reply({
        type,
        uuid,
        response: { name: MANIFEST.name, version: MANIFEST.version },
      });
      return;
    case "proxy":
      /* A8 legacy：占位，无实现 */
      reply({ type, uuid, response: null });
      return;
    case "getStore": {
      const key = message.data?.key;
      if (!key) {
        reply({ type, uuid, response: { data: {} } });
        return;
      }
      const data = await storageGet(key);
      reply({ type, uuid, response: { data } });
      return;
    }
    case "setStore": {
      const payload = message.data;
      if (payload?.key != null) {
        await storageSet({ [payload.key]: payload.data });
        if (payload.key === MODIFY_HEADER_KEY) {
          await applyModifyHeaderRules(payload.data ?? []);
        }
      }
      reply({ type, uuid, response: {} });
      return;
    }
    case "setTab": {
      // [A8 可证实] external：data.value = tabId，storage[key]=tabId，response=data
      const tabId = sender?.tab?.id;
      const payload = message.data;
      if (tabId && payload?.key) {
        const response = { ...payload, value: tabId, tabId };
        await storageSet({ [payload.key]: tabId });
        reply({ type, uuid, response });
        return;
      }
      reply({ type, uuid, response: null });
      return;
    }
    case "pbWsObserveGet": {
      const bag = await storageGet([
        PB_WS_STATUS_KEY,
        PB_WS_ENABLED_KEY,
        PB_WS_BOARD_KEY,
        "PB",
      ]);
      const observe = bag?.[PB_WS_STATUS_KEY] || null;
      const board = bag?.[PB_WS_BOARD_KEY];
      let latestOdds = Array.isArray(board?.cards)
        ? board.cards
        : Array.isArray(observe?.latestOdds)
          ? observe.latestOdds
          : [];
      const tabId = Number(bag?.PB);
      const tabIds = new Set();
      if (Number.isFinite(tabId) && tabId > 0) tabIds.add(tabId);
      try {
        const tabs = await chrome.tabs.query({
          url: ["*://*.part888.com/*", "*://*.ps3838.com/*"],
        });
        for (const t of tabs) {
          if (t.id) tabIds.add(t.id);
        }
      } catch {
        /* host / tabs 权限不足则只用 storage 里的 PB */
      }
      let observeOut = observe ? { ...observe, latestOdds } : { latestOdds };
      for (const id of tabIds) {
        try {
          const live = await chrome.tabs.sendMessage(id, { type: "pbWsObserveBoardGet" });
          if (!live || typeof live !== "object") continue;
          if (Array.isArray(live.latestOdds) && live.latestOdds.length)
            latestOdds = live.latestOdds;
          observeOut = { ...observeOut, latestOdds };
          const liveOpen = live.connected === true || Number(live.readyState) === 1;
          if (liveOpen) {
            observeOut.connected = true;
            if (live.readyState != null) observeOut.readyState = live.readyState;
            if (live.phase) observeOut.phase = live.phase;
            if (live.lastType) observeOut.lastType = live.lastType;
            if (live.frameCount != null) observeOut.frameCount = live.frameCount;
            break;
          }
          if (live.lastType) {
            observeOut.lastType = live.lastType;
            if (live.frameCount != null) observeOut.frameCount = live.frameCount;
          }
        } catch {
          /* 该 tab 未注入 content */
        }
      }
      reply({
        type,
        uuid,
        response: {
          enabled: bag?.[PB_WS_ENABLED_KEY] !== false,
          observe: observeOut,
        },
      });
      return;
    }
    case "pbWsObserveSet": {
      const enabled = message.data?.enabled === true;
      await storageSet({ [PB_WS_ENABLED_KEY]: enabled });
      reply({ type, uuid, response: { enabled } });
      return;
    }
    default:
      reply({ type, uuid, response: null });
  }
}

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== "object") return false;
  handleExternalMessage(message, sendResponse, sender);
  return true;
});

/** content script 内 setTab / PB WS 观测帧 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "pbWsObserveFrame") {
    void appendPbWsFrame(message.frame).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message?.type === "pbWsObserveStatus") {
    void mergePbWsStatus(message.status || {}).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message?.type === "pbWsObserveGet") {
    void handleExternalMessage(message, sendResponse, sender);
    return true;
  }
  if (message?.type !== "setTab") return false;
  const tabId = sender.tab?.id;
  const key = message.data?.key;
  if (!tabId || !key) {
    sendResponse({ success: false, type: message.type, uuid: message.uuid, response: "No tabId or key" });
    return true;
  }
  storageSet({ [key]: tabId }).then(() => {
    sendResponse({
      success: true,
      type: message.type,
      uuid: message.uuid,
      response: { ...message.data, key, tabId, value: tabId },
    });
  });
  return true;
});

initModifyHeaderListener();

/** 点击工具栏图标：优先侧边栏；无 Side Panel API 时回退 popup（如部分 Electron） */
async function initActionUi() {
  if (chrome.sidePanel?.setPanelBehavior) {
    try {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
      await chrome.action.setPopup({ popup: "" });
      return;
    } catch (err) {
      console.warn("[sidePanel]", err);
    }
  }
  try {
    await chrome.action.setPopup({ popup: "popup.html" });
  } catch (err) {
    console.warn("[action.setPopup]", err);
  }
}
void initActionUi();
