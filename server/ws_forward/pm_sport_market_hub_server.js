#!/usr/bin/env node
/**
 * Polymarket 体育 MARKET WS Hub — 与 changmen-pm-market-hub（电竞）完全独立进程/上游。
 * 浏览器连 /esport/ws-forward/PM-SPORT-MARKET；Caddy → PM_SPORT_MARKET_HUB_PORT（默认 3459）。
 * 实现副本：`core/pm_sport_market_hub.js`（不修改电竞 `core/pm_market_hub.js`）。
 */
import http from "node:http";
import { loadChangmenEnv } from "@changmen/storage/load_env.js";
import { initDatabaseUrl } from "@changmen/db";
import {
  attachPmSportMarketHub,
  closePmSportMarketHub,
  getPmSportMarketHubStatus,
  PM_SPORT_MARKET_HUB_PATH,
} from "./core/pm_sport_market_hub.js";

loadChangmenEnv();

const PORT = Number(process.env.PM_SPORT_MARKET_HUB_PORT || 3459);
const HUB_PATH = PM_SPORT_MARKET_HUB_PATH;

/** @type {(token: string) => Promise<{ userId: string, userName: string } | null>} */
async function resolveIdentityLight(token) {
  if (!token)
    return null;
  try {
    const { authGetUser, authPeekAccessToken, fetchUserById } = await import("@changmen/db");
    let userId = "";
    try {
      const auth = await authGetUser(token);
      userId = String(auth?.userId || "").trim();
    }
    catch {
      /* peek */
    }
    if (!userId) {
      try {
        const peek = authPeekAccessToken?.(token);
        userId = String(peek?.userId || "").trim();
      }
      catch {
        return null;
      }
    }
    if (!userId)
      return null;
    let userName = "";
    try {
      const user = await fetchUserById(userId);
      userName = String(user?.user_name || "").trim();
    }
    catch {
      /* optional */
    }
    return { userId, userName };
  }
  catch {
    return null;
  }
}

function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(text);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", "http://localhost");
  if (req.method === "GET" && (url.pathname === "/health" || url.pathname === "/")) {
    sendJson(res, 200, {
      status: "ok",
      service: "changmen-pm-sport-market-hub",
      path: HUB_PATH,
      uptime: Math.floor(process.uptime()),
      hub: getPmSportMarketHubStatus(),
    });
    return;
  }
  res.writeHead(404).end("Not Found");
});

attachPmSportMarketHub(server, {
  resolveIdentity: resolveIdentityLight,
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`[pm-sport-market-hub] port ${PORT} in use — refuse to start`);
    process.exit(1);
  }
  console.error("[pm-sport-market-hub] server error:", err);
  process.exit(1);
});

void (async () => {
  try {
    await initDatabaseUrl();
  }
  catch (err) {
    console.warn(
      "[pm-sport-market-hub] initDatabaseUrl failed — identity attribution disabled:",
      err instanceof Error ? err.message : err,
    );
  }
  server.listen(PORT, () => {
    console.log(
      `[pm-sport-market-hub] listening :${PORT} path=${HUB_PATH} (isolated from PM-MARKET esport hub)`,
    );
  });
})();

function shutdown(signal) {
  console.log(`[pm-sport-market-hub] ${signal}, closing`);
  closePmSportMarketHub();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
