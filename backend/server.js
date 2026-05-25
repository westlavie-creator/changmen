#!/usr/bin/env node
"use strict";

/**
 * 本地聚合服务：esport-api、WS 代理、FeedHub、静态托管。
 *
 * 路由（阶段 7，默认入口 /app/）：
 *   /app/       新控制台（Vue 构建产物 frontend/app/dist）
 *   /console/   旧 A8 bundle（需 PATCH_CONSOLE=1 或 npm run patch:ui）
 *   /feed/      Node Feed 聚合调试页（原根路径 /）
 *   /platforms/ 分平台调试页
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");
const { FeedHub } = require("./shared/feed_hub.js");
const { getCatalogSummary } = require("./shared/game_catalog.js");
const { getCatalogSummary: getMarketCatalogSummary } = require("./shared/market_catalog.js");
const { buildFeedHubEntries, listPlatforms, getPlatform } = require("./shared/platform_registry.js");
const { checkBet, placeBet, supportedPlatforms } = require("./shared/bet_engine.js");
const { attachEsportProxy } = require("./proxy/esport_proxy.js");
const { tryEsportApi } = require("./esport-api/router.js");
const { tryHttpProxyRelay } = require("./proxy/http_proxy_relay.js");
const { tryPbHttpProxy } = require("./proxy/pb_http_proxy.js");
const { tryObHttpProxy } = require("./proxy/ob_http_proxy.js");
const { tryRayHttpProxy } = require("./proxy/ray_http_proxy.js");
const { attachFeedBridge } = require("./esport-api/feed_bridge.js");
const { ensurePlatformCredentials } = require("./esport-api/platform_sync.js");
const { fetchObLogin, DEFAULT_LOGIN_URL } = require("./platforms/ob/ob_session.js");

const PORT = Number(process.env.PORT || 3456);
const ESPORT_PROXY_ENABLED = process.env.ENABLE_ESPORT_PROXY !== "0";
const BET_ENABLED = process.env.ENABLE_BET !== "0";
const PUBLIC_DIR = path.join(__dirname, "public");
const CONSOLE_DIR = path.join(__dirname, "..", "frontend", "console");
const APP_DIR = path.join(__dirname, "..", "frontend", "app", "dist");

const hub = new FeedHub(buildFeedHubEntries());

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  return "application/octet-stream";
}

function resolveStaticRoot(urlPath) {
  if (urlPath === "/feed" || urlPath.startsWith("/feed/")) {
    const fileRel =
      urlPath === "/feed" ? "/index.html" : urlPath.slice("/feed".length) || "/index.html";
    return { rootDir: PUBLIC_DIR, fileRel: fileRel === "/" ? "/index.html" : fileRel, spa: false };
  }
  if (urlPath === "/console" || urlPath.startsWith("/console/")) {
    const fileRel =
      urlPath === "/console"
        ? "/index.html"
        : urlPath.slice("/console".length) || "/index.html";
    return { rootDir: CONSOLE_DIR, fileRel: fileRel === "/" ? "/index.html" : fileRel, spa: false };
  }
  if (urlPath === "/app" || urlPath.startsWith("/app/")) {
    const fileRel =
      urlPath === "/app" ? "/index.html" : urlPath.slice("/app".length) || "/index.html";
    return { rootDir: APP_DIR, fileRel: fileRel === "/" ? "/index.html" : fileRel, spa: true };
  }
  let fileRel = urlPath;
  if (urlPath.endsWith("/") && urlPath.length > 1) {
    fileRel = `${urlPath}index.html`;
  }
  return { rootDir: PUBLIC_DIR, fileRel, spa: false };
}

function serveStatic(req, res) {
  let urlPath = req.url === "/" ? "/" : req.url.split("?")[0];

  // 默认入口：根路径 → 新控制台
  if (urlPath === "/" || urlPath === "/index.html") {
    res.writeHead(302, { Location: "/app/" });
    res.end();
    return;
  }

  const { rootDir, fileRel, spa } = resolveStaticRoot(urlPath);

  const filePath = path.normalize(path.join(rootDir, fileRel));
  if (!filePath.startsWith(rootDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  const sendFile = (fp, cacheBust) => {
    fs.readFile(fp, (readErr, data) => {
      if (readErr) {
        if (spa && !path.extname(fileRel)) {
          const indexPath = path.join(rootDir, "index.html");
          fs.readFile(indexPath, (indexErr, indexData) => {
            if (indexErr) {
              res.writeHead(404);
              res.end("Not found");
              return;
            }
            res.writeHead(200, {
              "Content-Type": "text/html; charset=utf-8",
              "Cache-Control": "no-cache, no-store, must-revalidate",
            });
            res.end(indexData);
          });
          return;
        }
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      const headers = { "Content-Type": contentType(fp) };
      if (cacheBust) {
        headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
      }
      res.writeHead(200, headers);
      res.end(data);
    });
  };

  sendFile(filePath, urlPath.startsWith("/console") || urlPath.startsWith("/app"));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) {
        reject(new Error("body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(new Error("invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function jsonResponse(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function handleBetApi(req, res, url) {
  if (!BET_ENABLED) {
    jsonResponse(res, 403, { error: "betting disabled (set ENABLE_BET=1)" });
    return true;
  }
  if (req.method === "GET" && url === "/api/bet/platforms") {
    jsonResponse(res, 200, { platforms: supportedPlatforms(), enabled: BET_ENABLED });
    return true;
  }
  if (req.method !== "POST") return false;

  try {
    const body = await readJsonBody(req);
    if (url === "/api/bet/check") {
      const { betRef, amount } = body;
      const result = await checkBet(betRef, amount);
      jsonResponse(res, 200, result);
      return true;
    }
    if (url === "/api/bet/place") {
      const { betRef, amount, payload } = body;
      const result = await placeBet(betRef, amount, { payload });
      jsonResponse(res, 200, result);
      return true;
    }
  } catch (err) {
    jsonResponse(res, 400, { error: err.message || String(err) });
    return true;
  }
  return false;
}

async function handleObDemoLogin(req, res) {
  if (req.method !== "GET") {
    jsonResponse(res, 405, { error: "method not allowed" });
    return true;
  }
  try {
    const loginUrl = process.env.OB_LOGIN_URL || DEFAULT_LOGIN_URL;
    const { json } = await fetchObLogin(loginUrl);
    jsonResponse(res, 200, json);
  } catch (err) {
    jsonResponse(res, 502, {
      status: false,
      message: err.message || String(err),
      data: null,
    });
  }
  return true;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = req.url.split("?")[0];
    const baseOrigin = `http://127.0.0.1:${PORT}`;
    if (await tryHttpProxyRelay(req, res, baseOrigin)) return;
    if (await tryPbHttpProxy(req, res)) return;
    if (await tryObHttpProxy(req, res)) return;
    if (await tryRayHttpProxy(req, res)) return;
    if (await tryEsportApi(req, res)) return;
    if (url === "/api/ob/demo-login") {
      await handleObDemoLogin(req, res);
      return;
    }
    if (url.startsWith("/api/bet")) {
      const handled = await handleBetApi(req, res, url);
      if (handled) return;
    }
    if (url === "/api/markets") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(getMarketCatalogSummary()));
      return;
    }
    if (url === "/api/games") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(getCatalogSummary()));
      return;
    }
    if (url === "/api/platforms") {
      const snap = hub.getSnapshot();
      const rows = listPlatforms().map((p) => {
        const live = snap.platforms[p.id];
        return {
          ...p,
          enabled: live?.enabled ?? p.enabled,
          matchCount: live?.matches?.length ?? 0,
          status: live?.status ?? null,
          updatedAt: live?.updatedAt ?? null,
        };
      });
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ platforms: rows, updatedAt: snap.updatedAt }));
      return;
    }
    if (url === "/api/snapshot") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(hub.getSnapshot()));
      return;
    }
    if (url.startsWith("/api/snapshot/")) {
      const raw = url.slice("/api/snapshot/".length).split("?")[0];
      const meta = getPlatform(raw);
      const platformId = meta?.id || raw.toUpperCase();
      const snap = hub.getSnapshot();
      const body = snap.platforms[platformId] || { error: "unknown platform", id: platformId };
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(body));
      return;
    }
    if (url === "/api/proxy/status") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(esportProxy ? esportProxy.getStatus() : { enabled: false }));
      return;
    }
    serveStatic(req, res);
  } catch (err) {
    console.error("[server]", req.url, err);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ success: 0, msg: err.message || "服务器错误", info: null }));
    }
  }
});

function normalizeUpgradePath(url) {
  try {
    const p = new URL(url, "http://127.0.0.1").pathname;
    return p.endsWith("/") && p.length > 1 ? p.slice(0, -1) : p;
  } catch {
    return url.split("?")[0];
  }
}

const wss = new WebSocketServer({ noServer: true });
const clients = new Set();

server.prependListener("upgrade", (request, socket, head) => {
  if (normalizeUpgradePath(request.url) !== "/ws") return;
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
});

function broadcast(message) {
  const text = JSON.stringify(message);
  for (const client of clients) {
    if (client.readyState === 1) client.send(text);
  }
}

wss.on("connection", (ws) => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: "snapshot", data: hub.getSnapshot() }));
  ws.on("close", () => clients.delete(ws));
});

hub.on((event) => broadcast(event));

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
      `[platform-sync] OB=${r.obSynced ? "ok" : "skip"} RAY=${r.raySynced ? "ok" : "skip"} PB=${r.pbSynced ? "ok" : "skip"} TF=${r.tfSynced ? "ok" : "skip"} IA=${r.iaSynced ? "ok" : "skip"} IMT=${r.imtSynced ? "ok" : "skip"} IM=${r.imSynced ? "ok" : "skip"} XBet=${r.xbetSynced ? "ok" : "skip"} Stake=${r.stakeSynced ? "ok" : "skip"} SABA=${r.sabaSynced ? "ok" : "skip"} HG=${r.hgSynced ? "ok" : "skip"}`
    );
  }
}).catch((err) => {
  console.warn("[platform-sync] failed:", err.message);
});

setTimeout(() => {
  ensurePlatformCredentials(hub).catch(() => {});
}, 20000);

let esportProxy = null;
if (ESPORT_PROXY_ENABLED) {
  esportProxy = attachEsportProxy(server, {
    ob: process.env.ENABLE_OB !== "0",
    ray: process.env.ENABLE_RAY !== "0",
    tf: process.env.ENABLE_TF === "1",
    rayOptions: {
      token: process.env.RAY_TOKEN,
      origin: process.env.RAY_ORIGIN,
    },
    tfOptions: {
      gateway: process.env.TF_GATEWAY,
      token: process.env.TF_TOKEN,
    },
  });
  esportProxy.start().catch((err) => {
    console.error("Esport proxy start failed:", err.message);
  });
}

server.listen(PORT, () => {
  const enabled = hub.platforms.filter((p) => p.enabled).map((p) => p.id).join(", ");
  const proxyNote = ESPORT_PROXY_ENABLED ? " | esport proxy: /esport/ws/{OB,RAY,TF}" : "";
  const bridgeNote = feedBridge.enabled
    ? " | esport-bridge: ON (Node→store)"
    : " | esport-bridge: off (browser collect via /app/)";
  console.log(
    `App (default): http://localhost:${PORT}/app/  |  feed: http://localhost:${PORT}/feed/  |  platforms: http://localhost:${PORT}/platforms/  |  legacy console: http://localhost:${PORT}/console/  [${enabled}]${proxyNote}${bridgeNote}`,
  );
  if (feedBridge.enabled) {
    setTimeout(() => {
      const r = feedBridge.sync();
      if (r.matches) console.log(`[esport-bridge] synced ${r.matches} matches, ${r.bets} bets`);
    }, 5000);
  }
});

process.on("SIGINT", () => {
  hub.stop();
  if (esportProxy) esportProxy.stop();
  server.close(() => process.exit(0));
});
