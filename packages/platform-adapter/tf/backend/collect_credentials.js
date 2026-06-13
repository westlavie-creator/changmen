/**
 * TF 采集凭证 — 从 platforms.json / 环境变量 / session 读取。
 * 配置方式（按优先级）：
 *   1. platforms.json 中 TF 行（platform_sync / persistPlatform 写入）
 *   2. 环境变量 TF_GATEWAY + TF_TOKEN
 */
import { getPlatform } from "@changmen/db/platform_storage.js";
import { tryLoadSession } from "./session.js";

export async function getTfA8CollectCredentials() {
  const platform = getPlatform("TF");
  if (platform?.gateway && platform?.token) {
    return {
      gateway: platform.gateway,
      token: platform.token,
      betName: platform.betName || "^获胜者$",
      games: platform.games || [],
      provider: "TF",
    };
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
