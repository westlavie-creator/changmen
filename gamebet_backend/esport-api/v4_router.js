"use strict";

const { resolveA8Credentials } = require("../shared/a8_config.js");
const { buildFormBody, v4Headers } = require("../shared/a8_v4_client.js");

const A8_V4_BASE = (process.env.A8_V4_URL || "https://api.a8.to/v4.0").replace(/\/+$/, "");

function fail(msg, info = null) {
  return { success: 0, msg, info };
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) {
        reject(new Error("body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

function parseFormBody(raw) {
  if (!raw) return {};
  const ct = raw.trim();
  if (ct.startsWith("{")) {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  const params = new URLSearchParams(raw);
  const out = {};
  for (const [k, v] of params.entries()) out[k] = v;
  return out;
}

function routePath(urlPath) {
  return urlPath.replace(/^\/v4\.0\/?/, "").replace(/^\//, "");
}

function rewriteV4LoginBody() {
  const cred = resolveA8Credentials();
  return buildFormBody({
    userName: cred.userName,
    password: cred.password,
  });
}

function userNotFoundHint() {
  const cred = resolveA8Credentials();
  return (
    `A8 v4 无账号「${cred.userName}」。请修改 gamebet_backend/shared/a8_constants.js 中的 A8_USER / A8_PASSWORD。`
  );
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isCloudflareBlock(status, text) {
  if (status !== 403) return false;
  const sample = String(text || "").slice(0, 800).toLowerCase();
  return (
    sample.includes("cloudflare")
    || sample.includes("cf-error")
    || sample.includes("you have been blocked")
  );
}

function cloudflareBlockedResponse() {
  return fail(
    "api.a8.to 被 Cloudflare 拦截（经本地 /v4.0/ 代理时 Node 被拒）。可换网络/VPN，或先在浏览器打开 A8 主站过验证后重试；勿设 VITE_V4_DIRECT=1（localhost 会 CORS）。",
    { code: "A8CloudflareBlocked" }
  );
}

async function proxyToA8(req, sub, rawBody) {
  const url = `${A8_V4_BASE}/${sub}`;
  const headers = v4Headers();
  const ct = req.headers["content-type"];
  if (ct) headers["Content-Type"] = ct;
  const token = req.headers.token || req.headers.Token;
  if (token) headers.token = token;
  const ua = req.headers["user-agent"];
  if (ua) headers["User-Agent"] = ua;
  const referer = req.headers.referer || req.headers.referrer;
  if (referer) headers.Referer = referer;

  const init = {
    method: req.method,
    headers,
    signal: AbortSignal.timeout(Number(process.env.A8_V4_TIMEOUT_MS || 30000)),
  };
  if (req.method === "POST") {
    init.body = rawBody || "";
  }

  const upstream = await fetch(url, init);
  const text = await upstream.text();
  return { status: upstream.status, text, contentType: upstream.headers.get("content-type") };
}

async function handleV4Request(req, res, urlPath) {
  const sub = routePath(urlPath);
  if (req.method !== "POST" && req.method !== "GET") {
    sendJson(res, 405, fail("method not allowed"));
    return true;
  }

  let rawBody = "";
  if (req.method === "POST") {
    try {
      rawBody = await readBody(req);
    } catch (err) {
      sendJson(res, 400, fail(err.message));
      return true;
    }
  }

  let forwardBody = rawBody;
  if (sub === "user/account/login") {
    forwardBody = rewriteV4LoginBody();
  }

  try {
    const upstream = await proxyToA8(req, sub, forwardBody);

    if (isCloudflareBlock(upstream.status, upstream.text)) {
      sendJson(res, 200, cloudflareBlockedResponse());
      return true;
    }

    if (sub === "user/account/login") {
      const parsed = tryParseJson(upstream.text);
      if (
        parsed?.success === 0
        && (parsed?.info?.code === "UserNotFound" || /用户不存在/.test(parsed?.msg || ""))
      ) {
        sendJson(res, 200, fail(userNotFoundHint(), parsed.info));
        return true;
      }
    }

    res.writeHead(upstream.status, {
      "Content-Type": upstream.contentType || "application/json; charset=utf-8",
    });
    res.end(upstream.text);
    return true;
  } catch (err) {
    sendJson(res, 502, fail(`A8 v4 代理失败: ${err.message}`));
    return true;
  }
}

module.exports = { handleV4Request };
