"use strict";

const { getCatalogSummary } = require("../../core/shared/game_catalog.js");
const { getCatalogSummary: getMarketCatalogSummary } = require("../../core/shared/market_catalog.js");
const { listPlatforms, getPlatform } = require("../../core/shared/platform_registry.js");
const { tryEsportApi, resolveCreditPlateUserName } = require("../../core/esport-api/router.js");
const store = require("../../core/esport-api/store.js");
const { getHardcodedCredentials } = require("../../core/integrations/a8/config.js");
const { tryHttpProxyRelay } = require("./proxy/http_proxy_relay.js");
const { tryPbHttpProxy } = require("./proxy/pb_http_proxy.js");
const { tryObHttpProxy } = require("./proxy/ob_http_proxy.js");
const { tryRayHttpProxy } = require("./proxy/ray_http_proxy.js");
const { tryIaHttpProxy } = require("./proxy/ia_http_proxy.js");
const { fetchObLogin, DEFAULT_LOGIN_URL } = require("../../platforms/ob/ob_session.js");

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

function createHttpHandler({ port, hub, serveStatic, getEsportProxy }) {
  return async function handleHttp(req, res) {
    try {
      const url = req.url.split("?")[0];
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
        const user = await store.getUserBySupabaseToken(token);
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
        jsonResponse(res, 200, { platforms: rows, updatedAt: snap.updatedAt });
        return;
      }
      if (url === "/api/snapshot") {
        jsonResponse(res, 200, hub.getSnapshot());
        return;
      }
      if (url.startsWith("/api/snapshot/")) {
        const raw = url.slice("/api/snapshot/".length).split("?")[0];
        const meta = getPlatform(raw);
        const platformId = meta?.id || raw.toUpperCase();
        const snap = hub.getSnapshot();
        const body = snap.platforms[platformId] || { error: "unknown platform", id: platformId };
        jsonResponse(res, 200, body);
        return;
      }
      if (url.toLowerCase() === "/api/proxy/status") {
        const esportProxy = getEsportProxy();
        jsonResponse(res, 200, esportProxy ? esportProxy.getStatus() : { enabled: false });
        return;
      }
      serveStatic(req, res);
    } catch (err) {
      console.error("[server]", req.url, err);
      if (!res.headersSent) {
        jsonResponse(res, 500, { success: 0, msg: err.message || "服务器错误", info: null });
      }
    }
  };
}

module.exports = { createHttpHandler };
