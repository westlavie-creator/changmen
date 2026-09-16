import { buildStakeOddsPush } from "../../stake-odds-protocol.js";

/**
 * 对齐 A8 `xn.send`：把 GraphQL WS next 推给 changmen 前端写 fo。
 * A8 走 47.115.75.57 Socket.IO；此处经 background `stake-odds` 端口中继。
 */
export function createA8Bridge(channel) {
  return {
    send(message) {
      try {
        // 不等待 sendResponse：避免与 background→tab 的余额/下注 POST 互相卡住
        const sent = chrome.runtime.sendMessage(buildStakeOddsPush(channel, message));
        if (sent && typeof sent.then === "function")
          void sent.catch(() => {});
      } catch {
        /* extension context invalidated */
      }
    },
  };
}
