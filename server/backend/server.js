#!/usr/bin/env node
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  fetchLiveTimers,
  fetchPlatformBets,
  fetchPlatformMatches,
  initLastWrittenIds,
} from "@changmen/db";
import { attachWsForward } from "@changmen/ws-forward";
import { attachChangmenRealtimeHub } from "@changmen/realtime-hub";
import { ensureSeed as ensureAccountSeed } from "./core/account/account_store.js";
import { setupAdminTools } from "./core/admin_tools/setup.js";
import { pullProfilesFromDb } from "./core/db/store.js";
import { ensurePlatformCredentials } from "./core/esport-api/platform_sync.js";
import store from "./core/esport-api/store.js";
import { ensureWinConsoleUtf8 } from "./core/shared/win_console_utf8.js";
import { createHttpHandler } from "./http_routes.js";
import { createStaticHandler } from "./static_files.js";

ensureWinConsoleUtf8();

setupAdminTools();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * 本地聚合服务：esport-api、HTTP 代理、静态托管。
 *
 * 路由（唯一控制台入口 /）：
 *   /           Vue 控制台（client/web/dist）
 *   /matcher/   赛事匹配面板
 *   /esport2/   静态资源与扩展包（extensions/*.zip）
 *
 * 访问 /console/ 会 301 重定向到 /。
 */

const PORT = Number(
  process.env.PORT || (process.platform === "win32" ? 3560 : 3456),
);
const PUBLIC_DIR = path.join(__dirname, "public");
const WEB_DIR
  = process.env.GAMEBET_WEB_DIR
    || process.env.GAMEBET_APP_DIR
    || path.join(__dirname, "../../client/web/dist");
const MATCHER_DIR
  = process.env.GAMEBET_MATCHER_DIR
    || path.join(__dirname, "../matcher/ui/public");
const MATCHER_EMBEDDED = String(process.env.MATCHER_EMBEDDED || "").trim() === "1";

const serveStatic = createStaticHandler({
  publicDir: PUBLIC_DIR,
  webDir: WEB_DIR,
  matcherDir: MATCHER_DIR,
});

const server = http.createServer(
  createHttpHandler({
    port: PORT,
    serveStatic,
  }),
);

attachWsForward(server, { platforms: ["IA", "OB", "RAY"] });
attachChangmenRealtimeHub(server);

ensurePlatformCredentials()
  .then((r) => {
    const any
      = r.obSynced
        || r.raySynced
        || r.pbSynced
        || r.tfSynced
        || r.iaSynced
        || r.imtSynced
        || r.imSynced
        || r.xbetSynced
        || r.stakeSynced
        || r.sabaSynced
        || r.hgSynced;
    if (any) {
      console.log(
        `[platform-sync] OB=${r.obSynced ? "ok" : "skip"} RAY=${r.raySynced ? "ok" : "skip"} PB=${r.pbSynced ? "ok" : "skip"} TF=${r.tfSynced ? "ok" : "skip"} IA=${r.iaSynced ? "ok" : "skip"} IMT=${r.imtSynced ? "ok" : "skip"} IM=${r.imSynced ? "ok" : "skip"} XBet=${r.xbetSynced ? "ok" : "skip"} Stake=${r.stakeSynced ? "ok" : "skip"} SABA=${r.sabaSynced ? "ok" : "skip"} HG=${r.hgSynced ? "ok" : "skip"}`,
      );
    }
  })
  .catch((err) => {
    console.warn("[platform-sync] failed:", err.message);
  });

setTimeout(() => {
  ensurePlatformCredentials().catch((err) => {
    console.warn("[platform-sync] retry failed:", err.message);
  });
}, 20000);

// 预填 _lastWrittenIds，使首次 matchMerge 的差量删除能覆盖上次遗留的 client_matches 行
initLastWrittenIds().catch((err) => {
  console.warn("[store] initLastWrittenIds failed:", err.message);
});

server.listen(PORT, onListen);

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.warn(`[server] 端口 ${PORT} 已被占用，跳过启动（将复用已有服务）`);
  }
  else if (err.code === "EACCES") {
    console.error(
      `[server] 端口 ${PORT} 无法监听（EACCES）。Windows Hyper-V 常保留 3426-3525；请设 PORT=3560 或运行 backend.bat`,
    );
    process.exit(1);
  }
  else {
    throw err;
  }
});

function restoreCollectorHotSnapshot() {
  // 从 platform_matches 恢复各平台数据（解决重启后 _matches 为空问题）
  return Promise.all([fetchPlatformMatches(), fetchPlatformBets(), fetchLiveTimers()])
    .then(([byPlatform, betsByKey, timersByPlatform]) => {
      const platforms = Object.keys(byPlatform || {});
      store.hydrateCollectorHotSnapshot({
        matchesRaw: byPlatform,
        bets: betsByKey,
        timers: timersByPlatform,
      });
      console.log(
        `[store] restored ${platforms.length} platforms, ${Object.keys(betsByKey || {}).length} bet snapshots, ${Object.keys(timersByPlatform || {}).length} timer snapshots from RDS`,
      );
    })
    .catch((err) => {
      console.warn("[store] restore collector snapshots from RDS failed:", err.message);
    });
}

function startEmbeddedMatcherAfter(readyPromise) {
  if (!MATCHER_EMBEDDED)
    return;
  void readyPromise
    .finally(() => import("../matcher/loop.js")
      .then(({ startMatcherLoop }) => startMatcherLoop({ mode: "embedded" }))
      .then((r) => {
        if (r?.ok)
          console.log(`[matcher] embedded loop started pid=${r.pid} interval=${r.intervalMs}ms`);
      })
      .catch((err) => {
        console.error("[matcher] embedded loop failed:", err.message);
      }));
}

function onListen() {
  store.ensureSeed();
  void pullProfilesFromDb().catch((err) => {
    console.warn("[db] pullProfilesFromDb:", err.message);
  });
  void ensureAccountSeed().catch((err) => {
    console.warn("[account_store] startup migrate:", err.message);
  });

  void restoreCollectorHotSnapshot();
  const v4Base = (process.env.A8_V4_URL || "https://api.a8.to/v4.0").replace(/\/+$/, "");
  console.log(`[v4] proxy only → ${v4Base}/ (no mock)`);
  console.log(
    `App: http://localhost:${PORT}/  |  matcher: http://localhost:${PORT}/matcher/  |  collect: browser`,
  );
  // matchMerge 读 RDS 快照，不依赖 hot 恢复；避免 deploy 心跳被全量 hydrate 拖过等待窗口
  startEmbeddedMatcherAfter(Promise.resolve());
}

process.on("SIGINT", () => {
  server.close(() => process.exit(0));
});
