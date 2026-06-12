/**
 * TF 采集凭证 — 从内存 store / platforms.json / 环境变量读取。
 * 配置方式（按优先级）：
 *   1. store.getPlatform("TF")（platform_sync 写入）
 *   2. platforms.json 或环境变量 TF_GATEWAY + TF_TOKEN
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import { BACKEND_ROOT } from "../../backend/_paths.js";
import { tryLoadSession } from "./session.js";

let storePromise;

function loadStore() {
  if (!storePromise) {
    const href = pathToFileURL(path.join(BACKEND_ROOT, "core/esport-api/store.js")).href;
    storePromise = import(href).then((m) => m.default);
  }
  return storePromise;
}

export async function getTfA8CollectCredentials() {
  try {
    const store = await loadStore();
    const platform = store.getPlatform("TF");
    if (platform?.gateway && platform?.token) {
      return {
        gateway: platform.gateway,
        token: platform.token,
        betName: platform.betName || "^获胜者$",
        games: platform.games || [],
        provider: "TF",
      };
    }
  } catch {
    /* store unavailable */
  }

  const session = tryLoadSession();
  if (session) {
    return {
      gateway: session.gateway,
      token: session.token,
      betName: session.betName || "^获胜者$",
      games: session.gameIds || [],
      provider: "TF",
    };
  }

  throw new Error(
    "TF 采集凭证未配置：请在 platforms.json 设置 TF 条目，或设置环境变量 TF_GATEWAY + TF_TOKEN",
  );
}

export function clearTfA8CollectCache() {
  /* 本地读取无缓存，保留函数签名兼容旧调用 */
}
