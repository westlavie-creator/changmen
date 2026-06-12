#!/usr/bin/env node
import { ensureWinConsoleUtf8 } from "./core/shared/win_console_utf8.js";

ensureWinConsoleUtf8();

import "dotenv/config";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensurePlatformCredentials } from "./core/esport-api/platform_sync.js";
import { initLastWrittenIds, fetchPlatformMatches } from "../shared/db/supabase.js";
import store from "./core/esport-api/store.js";
import { createStaticHandler } from "./static_files.js";
import { createHttpHandler } from "./http_routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * 本地聚合服务：esport-api、HTTP 代理、静态托管。
 *
 * 路由（默认入口 /）：
 *   /           新控制台（Vue 构建产物 gamebet_frontend/dist）
 *   /console/   旧 A8 bundle（可选，PATCH_CONSOLE=1；主流程不用）
 *   /matcher/   赛事匹配面板（gamebet_matcher/ui/public）
 */

const PORT = Number(
  process.env.PORT || (process.platform === "win32" ? 3560 : 3456),
);
const PUBLIC_DIR = path.join(__dirname, "public");
const CONSOLE_DIR =
  process.env.GAMEBET_CONSOLE_DIR ||
  path.join(__dirname, "../gamebet_frontend/console");
const WEB_DIR =
  process.env.GAMEBET_WEB_DIR ||
  process.env.GAMEBET_APP_DIR ||
  path.join(__dirname, "../gamebet_frontend/dist");
const MATCHER_DIR =
  process.env.GAMEBET_MATCHER_DIR ||
  path.join(__dirname, "../gamebet_matcher/ui/public");

const serveStatic = createStaticHandler({
  publicDir: PUBLIC_DIR,
  consoleDir: CONSOLE_DIR,
  webDir: WEB_DIR,
  matcherDir: MATCHER_DIR,
});

const server = http.createServer(
  createHttpHandler({
    port: PORT,
    serveStatic,
  }),
);

ensurePlatformCredentials()
  .then((r) => {
    const any =
      r.obSynced ||
      r.raySynced ||
      r.pbSynced ||
      r.tfSynced ||
      r.iaSynced ||
      r.imtSynced ||
      r.imSynced ||
      r.xbetSynced ||
      r.stakeSynced ||
      r.sabaSynced ||
      r.hgSynced;
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
  ensurePlatformCredentials().catch(() => {});
}, 20000);

// 预填 _lastWrittenIds，使首次 rebuild 的差量删除能覆盖上次遗留的 client_matches 行
initLastWrittenIds().catch(() => {});

server.listen(PORT, onListen);

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.warn(`[server] 端口 ${PORT} 已被占用，跳过启动（将复用已有服务）`);
  } else if (err.code === "EACCES") {
    console.error(
      `[server] 端口 ${PORT} 无法监听（EACCES）。Windows Hyper-V 常保留 3426-3525；请设 PORT=3560 或运行 backend.bat`,
    );
    process.exit(1);
  } else {
    throw err;
  }
});

function onListen() {
  store.ensureSeed();

  // 从 Supabase platform_matches 恢复各平台数据（解决重启后 _matches 为空问题）
  fetchPlatformMatches()
    .then((byPlatform) => {
      const platforms = Object.keys(byPlatform);
      if (!platforms.length) return;
      for (const [platform, matches] of Object.entries(byPlatform)) {
        store.saveMatches(platform, matches);
      }
      console.log(
        `[store] restored ${platforms.length} platforms from platform_matches: ${platforms.join(", ")}`,
      );
    })
    .catch((err) => {
      console.warn("[store] restore from platform_matches failed:", err.message);
    });
  const v4Base = (process.env.A8_V4_URL || "https://api.a8.to/v4.0").replace(/\/+$/, "");
  console.log(`[v4] proxy only → ${v4Base}/ (no mock)`);
  console.log(
    `App: http://localhost:${PORT}/  |  legacy console: http://localhost:${PORT}/console/  |  matcher: http://localhost:${PORT}/matcher/  |  collect: browser`,
  );
}

process.on("SIGINT", () => {
  server.close(() => process.exit(0));
});
