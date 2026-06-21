import http from "node:http";
import https from "node:https";
import { createRequire } from "node:module";
import { URL } from "node:url";
import zlib from "node:zlib";

const require = createRequire(import.meta.url);

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => {
      chunks.push(chunk);
      if (Buffer.concat(chunks).length > 5e6) {
        reject(new Error("body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function createDispatcher(proxyUrl) {
  if (!proxyUrl)
    return null;
  try {
    const { SocksProxyAgent } = require("socks-proxy-agent");
    return new SocksProxyAgent(proxyUrl);
  }
  catch {
    return null;
  }
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
        agent: options.dispatcher || undefined,
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
    req.on("error", reject);
    if (options.body)
      req.write(options.body);
    req.end();
  });
}

function resolveTargetUrl(proxyUrlHeader, baseOrigin) {
  if (!proxyUrlHeader)
    return null;
  if (/^https?:\/\//i.test(proxyUrlHeader))
    return proxyUrlHeader;
  const path = proxyUrlHeader.startsWith("/") ? proxyUrlHeader : `/${proxyUrlHeader}`;
  return `${baseOrigin}${path}`;
}

function forwardHeaders(req, targetUrl) {
  const out = {};
  for (const [key, value] of Object.entries(req.headers)) {
    const lower = key.toLowerCase();
    if (
      ["host", "connection", "content-length", "x-proxy", "x-proxy-url", "x-proxy-referer", "x-proxy-useragent", "x-proxy-origin",
        // 浏览器 fetch 会带 gzip；relay 只回写 Content-Type 时会导致压缩体无法解压
        "accept-encoding"].includes(lower)
    ) {
      continue;
    }
    out[key] = value;
  }
  const referer = req.headers["x-proxy-referer"];
  if (referer)
    out.Referer = referer;
  const origin = req.headers["x-proxy-origin"];
  if (origin) {
    out.Origin = origin;
  }
  else if (referer) {
    try {
      out.Origin = new URL(String(referer)).origin;
    }
    catch {
      /* ignore */
    }
  }
  const ua = req.headers["x-proxy-useragent"];
  if (ua)
    out["User-Agent"] = ua;
  const auth = req.headers.authorization || req.headers.Authorization;
  if (auth)
    out.Authorization = String(auth);
  try {
    out.Host = new URL(targetUrl).host;
  }
  catch {
    /* ignore */
  }
  return out;
}

const RELAY_PATH = "/esport/http-relay";

/**
 * A8 mr.get/post/test：向 relay 发请求，用 x-proxy-url 指定真实目标 URL。
 */
async function tryHttpProxyRelay(req, res, baseOrigin) {
  const pathname = req.url.split("?")[0];
  if (pathname !== RELAY_PATH)
    return false;

  const proxyTarget = req.headers["x-proxy-url"];
  if (!proxyTarget)
    return false;

  const targetUrl = resolveTargetUrl(String(proxyTarget), baseOrigin);
  if (!targetUrl)
    return false;

  const dispatcher = createDispatcher(req.headers["x-proxy"]);
  const requestBody = req.method !== "GET" && req.method !== "HEAD" ? await readRequestBody(req) : undefined;
  const headers = forwardHeaders(req, targetUrl);

  try {
    const upstream = await nodeFetch(targetUrl, {
      method: req.method,
      headers,
      body: requestBody,
      dispatcher,
    });
    let responseBody = upstream.body;
    const encoding = String(upstream.headers["content-encoding"] || "").toLowerCase();
    if (encoding.includes("gzip")) {
      try {
        responseBody = zlib.gunzipSync(responseBody);
      }
      catch {
        /* keep raw body */
      }
    }
    else if (encoding.includes("deflate")) {
      try {
        responseBody = zlib.inflateSync(responseBody);
      }
      catch {
        /* keep raw body */
      }
    }
    else if (responseBody.length >= 2 && responseBody[0] === 0x1F && responseBody[1] === 0x8B) {
      // 上游 gzip 但未带 Content-Encoding（部分 CDN）
      try {
        responseBody = zlib.gunzipSync(responseBody);
      }
      catch {
        /* keep raw body */
      }
    }
    const ct = upstream.headers["content-type"] || "application/json; charset=utf-8";
    res.writeHead(upstream.status, { "Content-Type": ct });
    res.end(responseBody);
    return true;
  }
  catch (err) {
    res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ success: 0, msg: err.message || "proxy relay failed" }));
    return true;
  }
}

export { RELAY_PATH, tryHttpProxyRelay };
