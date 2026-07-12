import { PLATFORMS } from "./platforms.js";

/** @type {Record<string, (message: unknown) => Promise<unknown>>} */
const tabHandlers = {};

/**
 * 注册标签页代发 handler
 * @param {string} platformId
 * @param {(message: unknown) => Promise<unknown>} handler
 */
export function registerTabHandler(platformId, handler) {
  tabHandlers[platformId] = handler;
}

/** 对齐 A8 `Me` — 按已注册 handler 路由消息 */
export function installTabProxyListener() {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const tabId = message?.options?.tabId;
    if (!tabId) return false;

    const platform = message?.options?.platform || message?.options?.provider || message?.platform;
    const handler = (platform && tabHandlers[platform])
      || tabHandlers[PLATFORMS.Stake]
      || tabHandlers[PLATFORMS.Dex];
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
