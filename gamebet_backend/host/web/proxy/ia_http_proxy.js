"use strict";

const { getPlatform } = require("../../../core/esport-api/store.js");

const IA_ALLOWED_PREFIX = "/api/game/";

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => {
      chunks.push(chunk);
      if (Buffer.concat(chunks).length > 1e6) {
        reject(new Error("body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/**
 * 前端采集跨域代理：代发 IA gateway 请求。
 * ilustre-analytics.org 不返回 CORS 头，浏览器 XHR 被阻止，须走后端中转。
 *
 * GET  /esport/ia/proxy?path=/api/game/game/gameListPageSplit/
 * POST /esport/ia/proxy?path=/api/game/game/getPointsListSplit  (body: JSON)
 */
async function tryIaHttpProxy(req, res) {
  const pathname = req.url.split("?")[0];
  if (pathname !== "/esport/ia/proxy") return false;

  let apiPath = new URL(req.url, "http://127.0.0.1").searchParams.get("path") || "";
  if (!apiPath.startsWith("/")) apiPath = `/${apiPath}`;
  if (!apiPath.startsWith(IA_ALLOWED_PREFIX)) {
    res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "invalid IA api path" }));
    return true;
  }

  const row = getPlatform("IA");
  if (!row?.gateway) {
    res.writeHead(503, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "IA not configured" }));
    return true;
  }

  const gateway = String(row.gateway).replace(/\/+$/, "");
  const target = `${gateway}${apiPath}`;

  const fetchOpts = {
    method: req.method,
    headers: { token: row.token || "" },
  };

  if (req.method === "POST") {
    fetchOpts.headers["Content-Type"] = "application/json";
    fetchOpts.body = await readBody(req);
  }

  try {
    const upstream = await fetch(target, fetchOpts);
    const body = Buffer.from(await upstream.arrayBuffer());
    const ct = upstream.headers.get("content-type") || "application/json; charset=utf-8";
    res.writeHead(upstream.status, { "Content-Type": ct });
    res.end(body);
  } catch (err) {
    res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: err.message || "IA proxy failed" }));
  }
  return true;
}

module.exports = { tryIaHttpProxy };
