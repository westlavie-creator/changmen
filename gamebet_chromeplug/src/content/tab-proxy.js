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

/** 对齐 A8 `Me` */
export function installTabProxyListener() {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const tabId = message?.options?.tabId;
    const stakeHandler = tabHandlers[PLATFORMS.Stake];
    if (!stakeHandler || !tabId) return false;

    void (async () => {
      try {
        const response = await stakeHandler(message);
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
