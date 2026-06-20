import { getCatalogSummary } from "@changmen/shared/catalog/game_catalog.mjs";
import { getCatalogSummary as getMarketCatalogSummary } from "@changmen/shared/catalog/market_catalog.mjs";
import { adapterRequire, requirePlatform } from "./core/shared/adapter_paths.js";
import { tryEsportApi, resolveCreditPlateUserName } from "./core/esport-api/router.js";
import store from "./core/esport-api/store.js";
import { getHardcodedCredentials } from "./core/integrations/a8/config.js";
import { tryHttpProxyRelay } from "./proxy/http_proxy_relay.js";
import { tryPbHttpProxy } from "./proxy/pb_http_proxy.js";
import { tryObHttpProxy } from "./proxy/ob_http_proxy.js";
import { tryRayHttpProxy } from "./proxy/ray_http_proxy.js";
import { tryIaHttpProxy } from "./proxy/ia_http_proxy.js";
import { getWsForwardStatus, isWsForwardHttpPath } from "@changmen/ws-forward";
import { isFastStaticRequest } from "./static_files.js";
import { getPgPool } from "@changmen/db";
import { listProfiles, countAccounts, getClientMatches } from "./core/db/store.js";

const { listPlatforms } = adapterRequire("registry", "feeds.js");
const { fetchObLogin, DEFAULT_LOGIN_URL } = requirePlatform("OB", "node", "session.js");

let _tryHandleMatcherApi;
async function getTryHandleMatcherApi() {
  if (!_tryHandleMatcherApi) {
    ({ tryHandleMatcherApi: _tryHandleMatcherApi } = await import(
      "../matcher/ui/http_bridge.js"
    ));
  }
  return _tryHandleMatcherApi;
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
      } catch {
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

export function createHttpHandler({ port, serveStatic }) {
  return async function handleHttp(req, res) {
    try {
      const url = req.url.split("?")[0];
      // Socket.IO 握手由 ws_forward 处理，勿走 esport-api / 静态文件
      if (isWsForwardHttpPath(url)) return;
      if (isFastStaticRequest(url, req.method)) {
        serveStatic(req, res);
        return;
      }
      const baseOrigin = `http://127.0.0.1:${port}`;
      if (await tryHttpProxyRelay(req, res, baseOrigin)) return;
      if (await tryPbHttpProxy(req, res)) return;
      if (await tryObHttpProxy(req, res)) return;
      if (await tryRayHttpProxy(req, res)) return;
      if (await tryIaHttpProxy(req, res)) return;
      if (await tryEsportApi(req, res)) return;
      if (url === "/api/ob/demo-login") {
        await handleObDemoLogin(req, res);
        return;
      }
      if (url === "/api/a8/defaults") {
        const cred = getHardcodedCredentials();
        jsonResponse(res, 200, { userName: cred.userName, password: cred.password });
        return;
      }
      if (url === "/api/a8/credit-plate-user") {
        const token =
          (typeof req.headers.token === "string" && req.headers.token) ||
          (typeof req.headers.Token === "string" && req.headers.Token) ||
          "";
        const user = await store.getUserByToken(token);
        const userName = resolveCreditPlateUserName(user);
        jsonResponse(res, 200, { userName });
        return;
      }
      if (url === "/api/markets") {
        jsonResponse(res, 200, getMarketCatalogSummary());
        return;
      }
      if (url === "/api/games") {
        jsonResponse(res, 200, getCatalogSummary());
        return;
      }
      if (url === "/api/platforms") {
        jsonResponse(res, 200, { platforms: listPlatforms(), updatedAt: Date.now() });
        return;
      }
      if (url.toLowerCase() === "/api/proxy/status") {
        const ws = getWsForwardStatus();
        jsonResponse(res, 200, {
          enabled: ws.enabled,
          wsRelay: ws.wsForward,
          wsForward: ws.wsForward,
          platforms: ws.platforms,
        });
        return;
      }
      if (url === "/health") {
        const pool = getPgPool();
        let db = false;
        let dbLatencyMs = -1;
        const poolStats = { total: 0, idle: 0, waiting: 0 };
        if (pool) {
          const t0 = Date.now();
          try { await pool.query("SELECT 1"); db = true; dbLatencyMs = Date.now() - t0; } catch { /* */ }
          poolStats.total = pool.totalCount ?? 0;
          poolStats.idle = pool.idleCount ?? 0;
          poolStats.waiting = pool.waitingCount ?? 0;
        }
        const mem = process.memoryUsage();
        const profiles = listProfiles();
        const matches = getClientMatches();
        const ws = getWsForwardStatus();
        jsonResponse(res, db ? 200 : 503, {
          status: db ? "ok" : "degraded",
          uptime: Math.floor(process.uptime()),
          version: "1.0.2",
          db: { connected: db, latencyMs: dbLatencyMs, pool: poolStats },
          memory: {
            rss: Math.round(mem.rss / 1048576),
            heapUsed: Math.round(mem.heapUsed / 1048576),
            heapTotal: Math.round(mem.heapTotal / 1048576),
          },
          data: {
            users: profiles.length,
            accounts: countAccounts(),
            clientMatches: matches?.length ?? 0,
          },
          wsForward: { enabled: ws.enabled, platforms: ws.platforms },
        });
        return;
      }
      if (await (await getTryHandleMatcherApi())(req, res)) return;
      serveStatic(req, res);
    } catch (err) {
      console.error("[server]", req.url, err);
      if (!res.headersSent) {
        jsonResponse(res, 500, { success: 0, msg: err.message || "\u670d\u52a1\u5668\u9519\u8bef", info: null });
      }
    }
  };
}
