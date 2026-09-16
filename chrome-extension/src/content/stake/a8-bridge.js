import { buildStakeOddsPush } from "../../stake-odds-protocol.js";

/**
 * 对齐 A8 `xn.send`：把 GraphQL WS next 推给 changmen 前端写 fo。
 * A8 走 47.115.75.57 Socket.IO；此处经 background `stake-odds` 端口中继。
 */
export function createA8Bridge(channel) {
  return {
    send(message) {
      try {
        chrome.runtime.sendMessage(buildStakeOddsPush(channel, message), () => {
          void chrome.runtime.lastError;
        });
      } catch {
        /* extension context invalidated */
      }
    },
  };
}
