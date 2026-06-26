/** A8 `d4e` [A8 可证实]：TF 赔率 WS 经 A8 聚合，host 在 api.a8.to ↔ 47.115.75.57 轮换 */
export const TF_WS_HOSTS = ["api.a8.to", "47.115.75.57"] as const;

export const TF_WS_PATH = "/esport/ws/TF";

/** A8 `c4e` ReconnectingWebSocket */
export const TF_WS_CONNECTION_TIMEOUT_MS = 4_000;
export const TF_WS_RECONNECT_MIN_MS = 1_000;
export const TF_WS_RECONNECT_MAX_MS = 5_000;

let wsHostRotate = 0;

export function resetTfWsHostRotateForTests() {
  wsHostRotate = 0;
}

/** 每次 connect / 重连调用，对齐 A8 `T5++` 轮换 */
export function nextTfWsHost(): string {
  const host = TF_WS_HOSTS[wsHostRotate % TF_WS_HOSTS.length]!;
  wsHostRotate += 1;
  return host;
}

/**
 * A8 `d4e(gateway, token)` — gateway 仅做 replace 不入 URL；auth_token 去 `Token ` 前缀。
 */
export function buildTfWsUrl(authToken: string, host = nextTfWsHost()): string {
  const auth = String(authToken || "").replace(/^Token\s+/i, "");
  return `wss://${host}${TF_WS_PATH}?auth_token=${auth}&combo=false`;
}

/** @deprecated 使用 buildTfWsUrl */
export function buildTfDirectWsUrl(authToken: string): string {
  return buildTfWsUrl(authToken);
}
