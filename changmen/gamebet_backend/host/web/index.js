#!/usr/bin/env node
"use strict";

/**
 * 本地聚合服务：esport-api、WS 代理、FeedHub、静态托管。
 *
 * 路由（阶段 7，默认入口 /app/）：
 *   /app/       新控制台（Vue 构建产物 gamebet_frontend/app/dist）
 *   /console/   旧 A8 bundle（需 PATCH_CONSOLE=1 或 npm run patch:ui）
 *   /feed/      Node Feed 聚合调试页（原根路径 /）
 *   /platforms/ 分平台调试页
 */

require("dotenv").config();
const http = require("http");
const path = require("path");
const { FeedHub } = require("../../core/shared/feed_hub.js");
const { buildFeedHubEntries } = require("../../core/shared/platform_registry.js");
const { attachEsportProxy } = require("./proxy/esport_proxy.js");
const { attachFeedBridge } = require("../../core/esport-api/feed_bridge.js");
const { ensurePlatformCredentials } = require("../../core/esport-api/platform_sync.js");
const store = require("../../core/esport-api/store.js");
const { createStaticHandler } = require("./static_files.js");
const { createHttpHandler } = require("./http_routes.js");
const { attachSnapshotWs } = require("./snapshot_ws.js");

const PORT = Number(process.env.PORT || 3456);
const ESPORT_PROXY_ENABLED = process.env.ENABLE_ESPORT_PROXY !== "0";
const PUBLIC_DIR = path.join(__dirname, "../../public");
const CONSOLE_DIR = process.env.GAMEBET_CONSOLE_DIR || path.join(__dirname, "../../../gamebet_frontend/console");
const APP_DIR = process.env.GAMEBET_APP_DIR     || path.join(__dirname, "../../../gamebet_frontend/app/dist");

const hub = new FeedHub(buildFeedHubEntries());
let esportProxy = null;

const serveStatic = createStaticHandler({
  publicDir: PUBLIC_DIR,
  consoleDir: CONSOLE_DIR,
  appDir: APP_DIR,
});

const server = http.createServer(
  createHttpHandler({
    port: PORT,
    hub,
    serveStatic,
    getEsportProxy: () => esportProxy,
  }),
);

attachSnapshotWs(server, hub);
const feedBridge = attachFeedBridge(hub);

hub.start().catch((err) => {
  console.error("Feed hub start failed:", err.message);
  hub.status.error = err.message;
});

ensurePlatformCredentials(hub).then((r) => {
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
}).catch((err) => {
  console.warn("[platform-sync] failed:", err.message);
});

setTimeout(() => {
  ensurePlatformCredentials(hub).catch(() => {});
}, 20000);

// Electron 模式下 renderer 经 IPC relay core 直连上游，WS relay 端点均为僵尸。
// process.versions.electron 在 Electron 主进程 require 时存在，node server.js 时不存在。
const IS_ELECTRON = Boolean(process.versions.electron);

if (ESPORT_PROXY_ENABLED) {
  esportProxy = attachEsportProxy(server, {
    // Electron：renderer 走 IPC relay core（OB/RAY/TF/IA），WS relay 全部关闭
    ob:  !IS_ELECTRON && process.env.ENABLE_OB_MQTT_RELAY !== "0",
    ray: !IS_ELECTRON && process.env.ENABLE_RAY !== "0",
    tf:  !IS_ELECTRON && process.env.ENABLE_TF === "1",
    ia:  !IS_ELECTRON && process.env.ENABLE_IA_RELAY !== "0",
    rayOptions: {
      token: process.env.RAY_TOKEN,
      origin: process.env.RAY_ORIGIN,
    },
    tfOptions: {
      gateway: process.env.TF_GATEWAY,
      token: process.env.TF_TOKEN,
    },
    iaOptions: {
      upstreamBase: process.env.IA_WS_URL,
      gateway: process.env.IA_GATEWAY,
    },
  });
  esportProxy.start().catch((err) => {
    console.error("Esport proxy start failed:", err.message);
  });
}

server.listen(PORT, onListen);

function onListen() {
  try {
    store.ensureSeed();
    const n = store.rebuildClientMatchListNow().length;
    console.log(`[store] client_matchs ready (${n} rows)`);
  } catch (err) {
    console.warn("[store] client_matchs init failed:", err.message);
  }
  const enabled = hub.platforms.filter((p) => p.enabled).map((p) => p.id).join(", ");
  const proxyNote = ESPORT_PROXY_ENABLED ? " | esport proxy: /esport/ws/{OB,RAY,TF,IA}" : "";
  const bridgeNote = feedBridge.enabled
    ? " | esport-bridge: ON (Node→store)"
    : " | esport-bridge: off (browser collect via /app/)";
  const v4Base = (process.env.A8_V4_URL || "https://api.a8.to/v4.0").replace(/\/+$/, "");
  console.log(`[v4] proxy only → ${v4Base}/ (no mock)`);
  console.log(
    `App (default): http://localhost:${PORT}/app/  |  feed: http://localhost:${PORT}/feed/  |  platforms: http://localhost:${PORT}/platforms/  |  legacy console: http://localhost:${PORT}/console/  [${enabled}]${proxyNote}${bridgeNote}`,
  );
  if (feedBridge.enabled) {
    setTimeout(() => {
      const r = feedBridge.sync();
      if (r.matches) console.log(`[esport-bridge] synced ${r.matches} matches, ${r.bets} bets`);
    }, 5000);
  }
}

process.on("SIGINT", () => {
  hub.stop();
  if (esportProxy) esportProxy.stop();
  server.close(() => process.exit(0));
});
