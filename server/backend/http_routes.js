import { getPgPool } from "@changmen/db";
import { getCatalogSummary } from "@changmen/shared/catalog/game_catalog";
import { getCatalogSummary as getMarketCatalogSummary } from "@changmen/shared/catalog/market_catalog";
import { getWsForwardStatus, isWsForwardHttpPath } from "@changmen/ws-forward";
import { countAccounts, getClientMatches, listProfiles } from "./core/db/store.js";
import { resolveCreditPlateUserName, tryEsportApi } from "./core/esport-api/router.js";
import store from "./core/esport-api/store.js";
import { getHardcodedCredentials } from "./core/integrations/a8/config.js";
import { adapterRequire, requirePlatform } from "./core/shared/adapter_paths.js";
import { tryHttpProxyRelay } from "./proxy/http_proxy_relay.js";
import { tryIaHttpProxy } from "./proxy/ia_http_proxy.js";
import { tryObHttpProxy } from "./proxy/ob_http_proxy.js";
import { tryPbHttpProxy } from "./proxy/pb_http_proxy.js";
import { tryRayHttpProxy } from "./proxy/ray_http_proxy.js";
import { isFastStaticRequest } from "./static_files.js";

const { listPlatforms } = adapterRequire("registry", "feeds.js");
const { fetchObLogin, DEFAULT_LOGIN_URL } = requirePlatform("OB", "node", "session.js");

let _tryHandleMatcherApi;
async function getTryHandleMatcherApi() {
  if (!_tryHandleMatcherApi) {
    ({ tryHandleMatcherApi: _tryHandleMatcherApi } = await import(
      "../matcher/ui/http_bridge.js",
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
      }
      catch {
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

function isLoopbackAddress(value) {
  const addr = String(value || "").trim().toLowerCase();
  return addr === "127.0.0.1"
    || addr === "::1"
    || addr === "localhost"
    || addr === "::ffff:127.0.0.1";
}

function isLocalHostHeader(value) {
  const host = String(value || "").trim().toLowerCase().replace(/^\[/, "").replace(/\](:\d+)?$/, "");
  const hostWithoutPort = host.includes(":") && !host.includes("::") ? host.split(":")[0] : host;
  return !hostWithoutPort || isLoopbackAddress(hostWithoutPort);
}

function isLocalRequest(req) {
  if (!isLocalHostHeader(req.headers.host))
    return false;
  const forwardedFor = String(req.headers["x-forwarded-for"] || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
  if (forwardedFor.length)
    return forwardedFor.every(isLoopbackAddress);
  const realIp = req.headers["x-real-ip"];
  if (realIp)
    return isLoopbackAddress(realIp);
  return isLoopbackAddress(req.socket?.remoteAddress);
}

function publicHealthResponse(req, res) {
  const accept = String(req.headers.accept || "");
  if (accept.includes("application/json")) {
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }
  res.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end("ok\n");
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
  }
  catch (err) {
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
      if (isWsForwardHttpPath(url))
        return;
      if (isFastStaticRequest(url, req.method)) {
        serveStatic(req, res);
        return;
      }
      const baseOrigin = `http://127.0.0.1:${port}`;
      if (await tryHttpProxyRelay(req, res, baseOrigin))
        return;
      if (await tryPbHttpProxy(req, res))
        return;
      if (await tryObHttpProxy(req, res))
        return;
      if (await tryRayHttpProxy(req, res))
        return;
      if (await tryIaHttpProxy(req, res))
        return;
      if (await tryEsportApi(req, res))
        return;
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
        const token
          = (typeof req.headers.token === "string" && req.headers.token)
            || (typeof req.headers.Token === "string" && req.headers.Token)
            || "";
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
        if (!isLocalRequest(req)) {
          publicHealthResponse(req, res);
          return;
        }
        const healthData = await buildHealthData();
        const accept = String(req.headers.accept || "");
        if (accept.includes("text/html")) {
          res.writeHead(healthData.db.connected ? 200 : 503, { "Content-Type": "text/html; charset=utf-8" });
          res.end(renderHealthPage(healthData));
        }
        else {
          jsonResponse(res, healthData.db.connected ? 200 : 503, healthData);
        }
        return;
      }
      if (await (await getTryHandleMatcherApi())(req, res))
        return;
      serveStatic(req, res);
    }
    catch (err) {
      console.error("[server]", req.url, err);
      if (!res.headersSent) {
        jsonResponse(res, 500, { success: 0, msg: err.message || "\u670D\u52A1\u5668\u9519\u8BEF", info: null });
      }
    }
  };
}

async function buildHealthData() {
  const pool = getPgPool();
  let db = false;
  let dbLatencyMs = -1;
  const poolStats = { total: 0, idle: 0, waiting: 0 };
  if (pool) {
    const t0 = Date.now();
    try { await pool.query("SELECT 1"); db = true; dbLatencyMs = Date.now() - t0; }
    catch { /* */ }
    poolStats.total = pool.totalCount ?? 0;
    poolStats.idle = pool.idleCount ?? 0;
    poolStats.waiting = pool.waitingCount ?? 0;
  }
  const mem = process.memoryUsage();
  const profiles = listProfiles();
  const matches = getClientMatches();
  const ws = getWsForwardStatus();
  return {
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
    wsForward: { enabled: ws.enabled, platforms: ws.platforms, platformStats: ws.platformStats },
  };
}

function renderHealthPage(d) {
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const statusColor = d.status === "ok" ? "#22c55e" : "#ef4444";
  const dbColor = d.db.connected ? "#22c55e" : "#ef4444";
  const latencyColor = d.db.latencyMs < 10 ? "#22c55e" : d.db.latencyMs < 50 ? "#eab308" : "#ef4444";
  const poolActive = d.db.pool.total - d.db.pool.idle;
  const poolPct = d.db.pool.total ? Math.round(poolActive / d.db.pool.total * 100) : 0;
  const heapPct = d.memory.heapTotal ? Math.round(d.memory.heapUsed / d.memory.heapTotal * 100) : 0;
  const uptimeStr = d.uptime >= 86400
    ? `${Math.floor(d.uptime / 86400)}d ${Math.floor(d.uptime % 86400 / 3600)}h`
    : d.uptime >= 3600
      ? `${Math.floor(d.uptime / 3600)}h ${Math.floor(d.uptime % 3600 / 60)}m`
      : `${Math.floor(d.uptime / 60)}m ${d.uptime % 60}s`;

  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>changmen health</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,system-ui,sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh;padding:24px}
.header{display:flex;align-items:center;gap:12px;margin-bottom:24px}
.dot{width:14px;height:14px;border-radius:50%;animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
.title{font-size:20px;font-weight:600;letter-spacing:.5px}
.meta{color:#94a3b8;font-size:13px;margin-left:auto}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}
.card{background:#1e293b;border-radius:12px;padding:20px;border:1px solid #334155}
.card-title{font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;margin-bottom:14px}
.row{display:flex;justify-content:space-between;align-items:center;padding:6px 0}
.label{color:#94a3b8;font-size:14px}
.value{font-size:14px;font-weight:500;font-variant-numeric:tabular-nums}
.badge{display:inline-block;padding:2px 10px;border-radius:9999px;font-size:12px;font-weight:600}
.bar-bg{height:6px;background:#334155;border-radius:3px;margin-top:4px;overflow:hidden}
.bar-fill{height:100%;border-radius:3px;transition:width .6s}
.platforms{display:flex;gap:6px;flex-wrap:wrap}
.platform-tag{background:#334155;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:500}
.refresh-note{text-align:center;color:#475569;font-size:12px;margin-top:20px}
</style>
</head>
<body>
<div class="header">
  <div class="dot" style="background:${statusColor}"></div>
  <div class="title">changmen</div>
  <div class="meta">v${esc(d.version)} &middot; uptime ${esc(uptimeStr)}</div>
</div>
<div class="grid">
  <div class="card">
    <div class="card-title">Database</div>
    <div class="row"><span class="label">Status</span><span class="badge" style="background:${dbColor}20;color:${dbColor}">${d.db.connected ? "Connected" : "Down"}</span></div>
    <div class="row"><span class="label">Latency</span><span class="value" style="color:${latencyColor}">${d.db.latencyMs}ms</span></div>
    <div class="row"><span class="label">Pool</span><span class="value">${poolActive} / ${d.db.pool.total} active</span></div>
    <div class="bar-bg"><div class="bar-fill" style="width:${poolPct}%;background:${poolPct > 80 ? "#ef4444" : "#3b82f6"}"></div></div>
    ${d.db.pool.waiting ? `<div class="row"><span class="label">Waiting</span><span class="value" style="color:#eab308">${d.db.pool.waiting}</span></div>` : ""}
  </div>
  <div class="card">
    <div class="card-title">Memory</div>
    <div class="row"><span class="label">RSS</span><span class="value">${d.memory.rss} MB</span></div>
    <div class="row"><span class="label">Heap</span><span class="value">${d.memory.heapUsed} / ${d.memory.heapTotal} MB</span></div>
    <div class="bar-bg"><div class="bar-fill" style="width:${heapPct}%;background:${heapPct > 85 ? "#ef4444" : heapPct > 60 ? "#eab308" : "#22c55e"}"></div></div>
  </div>
  <div class="card">
    <div class="card-title">Data</div>
    <div class="row"><span class="label">Users</span><span class="value">${d.data.users}</span></div>
    <div class="row"><span class="label">Accounts</span><span class="value">${d.data.accounts}</span></div>
    <div class="row"><span class="label">Matches</span><span class="value">${d.data.clientMatches}</span></div>
  </div>
  <div class="card">
    <div class="card-title">WebSocket Forward</div>
    <div class="row"><span class="label">Relay</span><span class="badge" style="background:${d.wsForward.enabled ? "#22c55e20" : "#ef444420"};color:${d.wsForward.enabled ? "#22c55e" : "#ef4444"}">${d.wsForward.enabled ? "Enabled" : "Disabled"}</span></div>
${(d.wsForward.platforms || []).map((pid) => {
  const ps = d.wsForward.platformStats?.[pid];
  if (!ps)
    return `    <div class="row"><span class="label">${esc(pid)}</span><span class="value" style="color:#475569">idle</span></div>`;
  const hasError = ps.lastError && ps.lastErrorAt && (Date.now() - ps.lastErrorAt < 600_000);
  const color = ps.active > 0 ? "#22c55e" : hasError ? "#ef4444" : "#94a3b8";
  const ago = ps.lastConnectedAt ? Math.floor((Date.now() - ps.lastConnectedAt) / 1000) : 0;
  const agoStr = ago > 3600 ? `${Math.floor(ago / 3600)}h ago` : ago > 60 ? `${Math.floor(ago / 60)}m ago` : ago > 0 ? `${ago}s ago` : "";
  let detail = `${ps.active} conn`;
  if (ps.totalConnections)
    detail += ` (total ${ps.totalConnections})`;
  return [
    `    <div class="row"><span class="label">${esc(pid)}</span><span class="value"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:6px"></span>${detail}</span></div>`,
    agoStr ? `    <div class="row"><span class="label"></span><span class="value" style="color:#475569;font-size:12px">last: ${esc(agoStr)}</span></div>` : "",
    hasError ? `    <div class="row"><span class="label"></span><span class="value" style="color:#ef4444;font-size:12px">${esc(ps.lastError)}</span></div>` : "",
  ].filter(Boolean).join("\n");
}).join("\n")}
  </div>
</div>
<div class="refresh-note">Auto-refresh 5s</div>
<script>setTimeout(()=>location.reload(),5000)</script>
</body>
</html>`;
}
