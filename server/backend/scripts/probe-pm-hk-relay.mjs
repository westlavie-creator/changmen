#!/usr/bin/env node
/**
 * PM HK 出口部署探针（Phase 1）
 *
 * 1. VPS 直连 Polymarket 上游（gamma / clob）
 * 2. 本机 http-relay 代发
 * 3. ws-forward 已注册 PM-MARKET / PM-USER
 * 4. PM-MARKET WebSocket 中继握手
 *
 * 用法（VPS / 本机 backend 目录）：
 *   node scripts/probe-pm-hk-relay.mjs
 *   node scripts/probe-pm-hk-relay.mjs --upstream-only
 *   ESPORT_TEST_BASE=http://127.0.0.1:3456 PROBE_TOKEN=xxx node scripts/probe-pm-hk-relay.mjs
 */
import http from "node:http";
import https from "node:https";
import { loadChangmenEnv } from "@changmen/storage/load_env.js";
import { buildHttpRelayUrl } from "@changmen/api-contract/urls";
import WebSocket from "ws";

loadChangmenEnv();

const args = new Set(process.argv.slice(2));
const upstreamOnly = args.has("--upstream-only");
const relayOnly = args.has("--relay-only");
const skipWs = args.has("--skip-ws") || upstreamOnly || relayOnly;

const UPSTREAM = {
  gamma: "https://gamma-api.polymarket.com/sports",
  clob: "https://clob.polymarket.com/time",
};

const PM_WS_FORWARD_PATH = "/esport/ws-forward/PM-MARKET";

const results = [];

function pass(name, detail = "") {
  results.push({ name, ok: true, detail });
  console.log(`OK   ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name, detail = "") {
  results.push({ name, ok: false, detail });
  console.error(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
}

function resolveApiBase() {
  const fromEnv = String(process.env.ESPORT_TEST_BASE || process.env.PROBE_API_BASE || "").trim();
  if (fromEnv)
    return fromEnv.replace(/\/+$/, "");
  const port = Number(process.env.PORT || 3456);
  return `http://127.0.0.1:${port}`;
}

function nodeFetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === "https:" ? https : http;
    const req = lib.request(
      parsed,
      {
        method: options.method || "GET",
        headers: options.headers || {},
        timeout: options.timeoutMs ?? 20_000,
      },
      (res) => {
        const chunks = [];
        res.on("data", c => chunks.push(c));
        res.on("end", () => {
          resolve({
            status: res.statusCode || 502,
            headers: res.headers,
            body: Buffer.concat(chunks),
          });
        });
      },
    );
    req.on("timeout", () => {
      req.destroy(new Error("timeout"));
    });
    req.on("error", reject);
    if (options.body)
      req.write(options.body);
    req.end();
  });
}

async function checkUpstreamDirect() {
  for (const [label, url] of Object.entries(UPSTREAM)) {
    try {
      const res = await nodeFetch(url);
      if (res.status >= 200 && res.status < 400) {
        pass(`upstream:${label}`, `HTTP ${res.status}`);
      }
      else {
        fail(`upstream:${label}`, `HTTP ${res.status}`);
      }
    }
    catch (err) {
      fail(`upstream:${label}`, err instanceof Error ? err.message : String(err));
    }
  }
}

async function checkHttpRelay(apiBase) {
  const relayUrl = buildHttpRelayUrl({ apiBase });
  const token = String(process.env.PROBE_TOKEN || process.env.ESPORT_TEST_TOKEN || "").trim();
  const headers = {
    "x-proxy-url": UPSTREAM.clob,
    "x-proxy-referer": "https://polymarket.com/",
    "x-proxy-origin": "https://polymarket.com",
  };
  if (token)
    headers.token = token;

  try {
    const res = await nodeFetch(relayUrl, { headers, timeoutMs: 25_000 });
    if (res.status >= 200 && res.status < 400) {
      pass("http-relay:clob-time", `HTTP ${res.status} via ${relayUrl}`);
    }
    else {
      const snippet = res.body.toString("utf8").slice(0, 120);
      fail("http-relay:clob-time", `HTTP ${res.status} ${snippet}`);
    }
  }
  catch (err) {
    fail("http-relay:clob-time", err instanceof Error ? err.message : String(err));
  }

  const relayRequireToken = ["1", "true", "yes", "on"].includes(
    String(process.env.HTTP_RELAY_REQUIRE_TOKEN || "").trim().toLowerCase(),
  );
  if (relayRequireToken && !token) {
    fail("http-relay:token", "HTTP_RELAY_REQUIRE_TOKEN=1 但未设置 PROBE_TOKEN / ESPORT_TEST_TOKEN");
  }
  else if (relayRequireToken) {
    pass("http-relay:token", "已提供 PROBE_TOKEN");
  }
}

async function checkProxyStatus(apiBase) {
  try {
    const res = await nodeFetch(`${apiBase}/api/proxy/status`);
    if (res.status !== 200) {
      fail("ws-forward:status", `HTTP ${res.status}`);
      return;
    }
    const data = JSON.parse(res.body.toString("utf8"));
    const platforms = Array.isArray(data.platforms) ? data.platforms : [];
    const need = ["PM-MARKET", "PM-USER"];
    const missing = need.filter(id => !platforms.includes(id));
    if (!data.enabled) {
      fail("ws-forward:enabled", "ws_forward 未启用（检查 server.js attachWsForward）");
      return;
    }
    if (missing.length) {
      fail("ws-forward:platforms", `缺少 ${missing.join(", ")}；当前: ${platforms.join(", ") || "(empty)"}`);
      return;
    }
    pass("ws-forward:platforms", need.join(", "));
  }
  catch (err) {
    fail("ws-forward:status", err instanceof Error ? err.message : String(err));
  }
}

function checkPmMarketWsRelay(apiBase) {
  return new Promise((resolve) => {
    const base = new URL(apiBase);
    const wsOrigin = `${base.protocol === "https:" ? "wss:" : "ws:"}//${base.host}`;
    const wsUrl = `${wsOrigin}${PM_WS_FORWARD_PATH}`;
    const timer = setTimeout(() => {
      fail("ws-forward:PM-MARKET", "连接超时（15s）");
      resolve();
    }, 15_000);

    let ws;
    try {
      ws = new WebSocket(wsUrl, { handshakeTimeout: 12_000 });
    }
    catch (err) {
      clearTimeout(timer);
      fail("ws-forward:PM-MARKET", err instanceof Error ? err.message : String(err));
      resolve();
      return;
    }

    ws.on("open", () => {
      ws.send("PING");
    });

    ws.on("message", (data) => {
      const text = String(data);
      clearTimeout(timer);
      ws.close();
      if (text === "PONG" || text.trim().startsWith("{") || text.trim().startsWith("[")) {
        pass("ws-forward:PM-MARKET", `connected ${wsUrl}`);
      }
      else {
        pass("ws-forward:PM-MARKET", `connected (frame: ${text.slice(0, 40)})`);
      }
      resolve();
    });

    ws.on("error", (err) => {
      clearTimeout(timer);
      fail("ws-forward:PM-MARKET", `${wsUrl} — ${err.message}`);
      resolve();
    });

    ws.on("close", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function main() {
  const apiBase = resolveApiBase();
  console.log(`== probe-pm-hk-relay apiBase=${apiBase} ==`);

  if (!relayOnly)
    await checkUpstreamDirect();

  if (!upstreamOnly) {
    await checkHttpRelay(apiBase);
    await checkProxyStatus(apiBase);
    if (!skipWs) {
      await checkPmMarketWsRelay(apiBase);
    }
  }

  const failed = results.filter(r => !r.ok);
  console.log("");
  if (failed.length) {
    console.error(`== FAIL (${failed.length}/${results.length}) ==`);
    for (const r of failed) console.error(`  - ${r.name}: ${r.detail}`);
    console.error("");
    console.error("修复提示:");
    console.error("  1. upstream 失败 → VPS 需能直连 polymarket.com（HK 出口）");
    console.error("  2. http-relay 失败 → 检查 HTTP_RELAY_ALLOWED_HOSTS、HTTP_RELAY_REQUIRE_TOKEN、pm2 restart changmen-web");
    console.error("  3. ws-forward 失败 → 确认已部署含 PM-MARKET/PM-USER 的代码并重启 backend");
    console.error("  4. 配置 env: deploy/scripts/sync-pm-hk-relay-env-remote.sh");
    process.exit(1);
  }
  console.log(`== PASS (${results.length}/${results.length}) ==`);
}

main().catch((err) => {
  console.error("probe-pm-hk-relay:", err instanceof Error ? err.message : err);
  process.exit(1);
});
