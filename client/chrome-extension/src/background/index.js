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
      const tabId = sender?.tab?.id;
      const payload = message.data;
      if (tabId && payload?.key) {
        await storageSet({ [payload.key]: tabId });
        reply({ type, uuid, response: { ...payload, tabId } });
        return;
      }
      reply({ type, uuid, response: null });
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

/** content script 内 setTab（无 external sender） */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
      response: { key, tabId },
    });
  });
  return true;
});

initModifyHeaderListener();
