import dns from "node:dns/promises";
import net from "node:net";
import tls from "node:tls";
import { performance } from "node:perf_hooks";
import { getWsForwardStatus } from "@changmen/ws-forward";

const CLOB_ORIGIN = String(process.env.POLYMARKET_CLOB_API || "https://clob.polymarket.com").replace(/\/+$/, "");
const PM_MARKET_WS_HOST = "ws-subscriptions-clob.polymarket.com";
const PM_MARKET_WS_PATH = "/ws/market";
const DEFAULT_TIMEOUT_MS = 2500;

function nowIso() {
  return new Date().toISOString();
}

function elapsedMs(t0) {
  return Math.max(0, Math.round(performance.now() - t0));
}

function shortError(err) {
  if (!err)
    return "unknown error";
  if (err.name === "AbortError")
    return "timeout";
  const code = err.code ? `${err.code}: ` : "";
  return `${code}${err.message || String(err)}`.slice(0, 180);
}

function timeoutSignal(timeoutMs) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs).unref?.();
  return {
    signal: ac.signal,
    clear() {
      clearTimeout(timer);
    },
  };
}

async function timedStep(name, fn) {
  const t0 = performance.now();
  try {
    const info = await fn();
    return { name, ok: true, latencyMs: elapsedMs(t0), ...(info || {}) };
  }
  catch (err) {
    return { name, ok: false, latencyMs: elapsedMs(t0), error: shortError(err) };
  }
}

async function probeDns(hostname) {
  return timedStep("dns", async () => {
    const addrs = await dns.lookup(hostname, { all: true });
    return {
      host: hostname,
      addresses: addrs.slice(0, 4).map(row => row.address),
      addressCount: addrs.length,
    };
  });
}

function probeTcp(hostname, port, timeoutMs) {
  return timedStep("tcp", () => new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: hostname, port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("timeout"));
    }, timeoutMs);
    socket.once("connect", () => {
      clearTimeout(timer);
      const remoteAddress = socket.remoteAddress || "";
      socket.end();
      resolve({ host: hostname, port, remoteAddress });
    });
    socket.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  }));
}

function probeTls(hostname, port, timeoutMs) {
  return timedStep("tls", () => new Promise((resolve, reject) => {
    const socket = tls.connect({
      host: hostname,
      port,
      servername: hostname,
      rejectUnauthorized: true,
    });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("timeout"));
    }, timeoutMs);
    socket.once("secureConnect", () => {
      clearTimeout(timer);
      const cert = socket.getPeerCertificate();
      const validTo = typeof cert?.valid_to === "string" ? cert.valid_to : "";
      socket.end();
      resolve({
        host: hostname,
        port,
        authorized: socket.authorized,
        alpnProtocol: socket.alpnProtocol || "",
        certValidTo: validTo,
      });
    });
    socket.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  }));
}

async function fetchJsonStep(name, url, timeoutMs, pick) {
  return timedStep(name, async () => {
    const t = timeoutSignal(timeoutMs);
    try {
      const res = await fetch(url, {
        signal: t.signal,
        headers: {
          Accept: "application/json",
          "User-Agent": "@changmen/pm-market-observability",
        },
      });
      const text = await res.text();
      let parsed = null;
      try { parsed = text ? JSON.parse(text) : null; }
      catch { /* keep parsed null */ }
      return {
        url,
        status: res.status,
        ok: res.ok,
        ...(pick ? pick(parsed, text, res) : {}),
      };
    }
    finally {
      t.clear();
    }
  });
}

async function fetchHubHealthJson(url, timeoutMs) {
  return fetchJsonStep("hub", url, timeoutMs, (json) => ({
    service: json?.service || "",
    path: json?.path || "",
    uptime: Number(json?.uptime || 0),
    hub: json?.hub && typeof json.hub === "object" ? json.hub : null,
  }));
}

function localHubHealthUrl() {
  const port = Number(process.env.PM_MARKET_HUB_PORT || 3457);
  if (!Number.isFinite(port) || port <= 0)
    return "";
  return `http://127.0.0.1:${port}/health`;
}

function publicHubHealthUrl() {
  const raw = String(process.env.MARKET_HUB_PRIMARY_HEALTH_URL ?? "").trim();
  if (raw === "0" || raw.toLowerCase() === "off")
    return "";
  if (raw)
    return raw;
  const origin = String(process.env.MARKET_HUB_PRIMARY_ORIGIN || "https://ws.changmen.fun").trim().replace(/\/+$/, "");
  return origin ? `${origin}/health/pm-market` : "";
}

async function probeHub(timeoutMs) {
  const localUrl = localHubHealthUrl();
  const publicUrl = publicHubHealthUrl();
  const local = localUrl ? await fetchHubHealthJson(localUrl, Math.min(timeoutMs, 800)) : null;
  if (local?.ok)
    return { source: "local", local, public: null, selected: local };
  const publicResult = publicUrl ? await fetchHubHealthJson(publicUrl, timeoutMs) : null;
  return {
    source: publicResult?.ok ? "public" : local ? "local-failed" : "public-failed",
    local,
    public: publicResult,
    selected: publicResult?.ok ? publicResult : local,
  };
}

async function probeClob(timeoutMs) {
  const timeUrl = `${CLOB_ORIGIN}/time`;
  const bookTokenId = String(
    process.env.PM_MARKET_PROBE_TOKEN_ID
    || process.env.POLYMARKET_PROBE_TOKEN_ID
    || "",
  ).trim();
  const time = await fetchJsonStep("clobTime", timeUrl, timeoutMs, json => ({
    serverTime: typeof json === "number" ? json : json?.time ?? json?.serverTime ?? null,
  }));
  const book = bookTokenId
    ? await fetchJsonStep(
      "clobBook",
      `${CLOB_ORIGIN}/book?token_id=${encodeURIComponent(bookTokenId)}`,
      timeoutMs,
      json => ({
        tokenId: bookTokenId,
        bids: Array.isArray(json?.bids) ? json.bids.length : 0,
        asks: Array.isArray(json?.asks) ? json.asks.length : 0,
      }),
    )
    : {
        name: "clobBook",
        ok: null,
        skipped: true,
        reason: "set PM_MARKET_PROBE_TOKEN_ID to enable book probe",
      };
  return { origin: CLOB_ORIGIN, time, book };
}

export async function buildPmMarketObservabilitySnapshot(opts = {}) {
  const timeoutMs = Number.isFinite(Number(opts.timeoutMs))
    ? Math.max(500, Math.min(8000, Number(opts.timeoutMs)))
    : DEFAULT_TIMEOUT_MS;
  const ws = getWsForwardStatus();
  const hubFromProcess = ws.hubs?.pmMarket || null;
  const [clobDns, wsDns, wsTcp, wsTls, clob, hub] = await Promise.all([
    probeDns(new URL(CLOB_ORIGIN).hostname),
    probeDns(PM_MARKET_WS_HOST),
    probeTcp(PM_MARKET_WS_HOST, 443, timeoutMs),
    probeTls(PM_MARKET_WS_HOST, 443, timeoutMs),
    probeClob(timeoutMs),
    probeHub(timeoutMs),
  ]);
  const selectedHub = hubFromProcess || hub.selected?.hub || null;
  const checks = [
    clobDns,
    wsDns,
    wsTcp,
    wsTls,
    clob.time,
    ...(clob.book.skipped ? [] : [clob.book]),
    hub.selected || null,
  ].filter(Boolean);
  const failed = checks.filter(row => row.ok === false);
  const status = failed.length ? "degraded" : "ok";
  return {
    status,
    checkedAt: nowIso(),
    timeoutMs,
    upstream: {
      clobOrigin: CLOB_ORIGIN,
      marketWsUrl: `wss://${PM_MARKET_WS_HOST}${PM_MARKET_WS_PATH}`,
      dns: { clob: clobDns, marketWs: wsDns },
      marketWs: { tcp: wsTcp, tls: wsTls },
      clob,
    },
    hub: {
      source: hubFromProcess ? "process" : hub.source,
      localUrl: localHubHealthUrl(),
      publicUrl: publicHubHealthUrl(),
      process: hubFromProcess,
      local: hub.local,
      public: hub.public,
      selected: selectedHub,
    },
    summary: {
      failedChecks: failed.map(row => row.name),
      activeClients: Number(selectedHub?.activeClients || 0),
      subscribedAssets: Number(selectedHub?.subscribedAssets || 0),
      upstreamConnected: Boolean(selectedHub?.upstreamConnected),
      pendingMaxAgeMs: Number(selectedHub?.pendingMaxAgeMs || 0),
      softSkipTotal: Number(selectedHub?.softSkipTotal || 0),
      hardSkipTotal: Number(selectedHub?.hardSkipTotal || 0),
      bookProbeEnabled: !clob.book.skipped,
    },
  };
}
