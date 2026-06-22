import { PLATFORMS } from "./platforms.js";

/** @type {Record<string, (message: unknown) => Promise<unknown>>} */
const tabHandlers = {};

/**
 * 注册标签页代发 handler（Stake）
 * @param {string} platformId
 * @param {(message: unknown) => Promise<unknown>} handler
 */
export function registerTabHandler(platformId, handler) {
  tabHandlers[platformId] = handler;
}

/** 对齐 A8 `Me` — 通用标签页代发（Stake / Dex 等） */
export function installTabProxyListener() {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const tabId = message?.options?.tabId;
    if (!tabId) return false;

    const handler = findHandler();
    if (!handler) return false;

    void (async () => {
      try {
        const response = await handler(message);
        sendResponse({ success: true, type: message.type, uuid: message.uuid, response });
      } catch (err) {
        sendResponse({
          success: false,
          type: message.type,
          uuid: message.uuid,
          response: err instanceof Error ? err.message : String(err),
        });
      }
    })();

    return true;
  });
}

function findHandler() {
  for (const id of Object.keys(tabHandlers)) {
    if (tabHandlers[id]) return tabHandlers[id];
  }
  return null;
}
