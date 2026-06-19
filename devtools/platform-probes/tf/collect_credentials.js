/**
 * TF 采集凭证 — 对齐 A8 `Ut.getPlatform(TF)`：
 *   POST https://api.a8.to/esport/Client_GetCollectPlatform
 *   POST Client_GetGames
 *
 * 本地兜底：platforms.json / TF_GATEWAY+TF_TOKEN（changmen 自托管）。
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getPlatform } from "@changmen/storage/platform_storage.js";
import { tryLoadSession } from "./session.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function loadA8EsportClient() {
  const modPath = path.resolve(
    __dirname,
    "../../../server/backend/core/integrations/a8/esport_client.js",
  );
  return import(pathToFileURL(modPath).href);
}

function fromPlatformRow(row) {
  return {
    gateway: row.gateway,
    token: row.token,
    betName: row.betName || "(独赢)",
    games: (row.games || []).map(String),
    provider: "TF",
  };
}

export async function getTfA8CollectCredentials() {
  const envGateway = process.env.TF_GATEWAY;
  const envToken = process.env.TF_TOKEN;
  if (envGateway && envToken) {
    return {
      gateway: envGateway,
      token: envToken,
      betName: process.env.TF_BET_NAME || "(独赢)",
      games: tryLoadSession()?.gameIds?.map(String) || [],
      provider: "TF",
    };
  }

  if (process.env.TF_LOCAL_CREDENTIALS !== "1") {
    try {
      const { fetchCollectPlatformWithGames } = await loadA8EsportClient();
      const remote = await fetchCollectPlatformWithGames("TF");
      return {
        gateway: remote.gateway,
        token: remote.token,
        betName: remote.betName || "(独赢)",
        games: remote.games || [],
        provider: "TF",
      };
    } catch (err) {
      if (process.env.TF_REQUIRE_A8_ESPORT === "1") {
        throw err;
      }
    }
  }

  const platform = getPlatform("TF");
  if (platform?.gateway && platform?.token) {
    return fromPlatformRow(platform);
  }

  const session = tryLoadSession();
  if (session) {
    return {
      gateway: session.gateway,
      token: session.token,
      betName: session.betName || "(独赢)",
      games: session.gameIds || [],
      provider: "TF",
    };
  }

  throw new Error(
    "TF 采集凭证未配置：设置 A8 账号（a8_config.json / A8_V4_USER）或 platforms.json / TF_GATEWAY+TF_TOKEN",
  );
}

export function clearTfA8CollectCache() {
  /* esport_client 内部缓存；保留函数签名兼容旧调用 */
  void loadA8EsportClient()
    .then((m) => m.clearEsportClientCache?.())
    .catch(() => {});
}
