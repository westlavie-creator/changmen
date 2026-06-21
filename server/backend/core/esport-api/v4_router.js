import { A8_GAME_ID_PB, A8_USER, A8_V4_PASSWORD } from "../integrations/a8/constants.js";
import { loginV4, playLoginV4 } from "../integrations/a8/v4_client.js";

/** v4.0 接口 — 转发 A8 api.a8.to（login/play）；body 可省略，默认 a8_constants 账号 */

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
  if (!raw)
    return {};
  if (raw.trim().startsWith("{")) {
    try {
      return JSON.parse(raw);
    }
    catch {
      return {};
    }
  }
  const out = {};
  for (const [k, v] of new URLSearchParams(raw).entries()) out[k] = v;
  return out;
}

function routePath(urlPath) {
  return urlPath.replace(/^\/v4\.0\/?/, "").replace(/^\//, "");
}

export async function handleV4Request(req, res, urlPath) {
  const sub = routePath(urlPath);

  if (req.method !== "POST" && req.method !== "GET") {
    sendJson(res, 405, fail("method not allowed"));
    return true;
  }

  let rawBody = "";
  if (req.method === "POST") {
    try {
      rawBody = await readBody(req);
    }
    catch (err) {
      sendJson(res, 400, fail(err.message));
      return true;
    }
  }

  const body = parseFormBody(rawBody);

  if (sub === "user/account/login") {
    const userName = String(body.userName || body.username || A8_USER).trim();
    const password = body.password || A8_V4_PASSWORD;
    try {
      const data = await loginV4(userName, password);
      sendJson(res, 200, data ?? fail("登录无响应"));
    }
    catch (err) {
      sendJson(res, 200, fail(err.message || "v4 登录失败"));
    }
    return true;
  }

  if (sub === "game/play/Login") {
    const token = String(req.headers.token || req.headers.Token || "").trim();
    const gameId = body.gameId ?? body.game_id ?? A8_GAME_ID_PB;
    if (!token) {
      sendJson(res, 200, fail("缺少 token"));
      return true;
    }
    try {
      const data = await playLoginV4(gameId, token);
      sendJson(res, 200, data ?? fail("game/play 无响应"));
    }
    catch (err) {
      sendJson(res, 200, fail(err.message || "game/play 请求失败"));
    }
    return true;
  }

  sendJson(res, 200, { success: 1, msg: "ok", info: null });
  return true;
}
