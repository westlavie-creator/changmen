import store from "../../esport-api/store.js";
import {
  getPolymarketRelayerPublicStatus,
  signPolymarketRelayerRequest,
} from "./relayer_sign.js";
import { getPolymarketRelayerUrl } from "./relayer_config.js";

function readAuthToken(req) {
  const bearer = String(req.headers.authorization || "").trim();
  if (bearer.toLowerCase().startsWith("bearer "))
    return bearer.slice(7).trim();
  return String(req.headers.token || req.headers.Token || "").trim();
}

async function requireAuthedUser(req) {
  const token = readAuthToken(req);
  if (!token)
    return { error: { status: 401, body: { error: "未登录" } } };
  const user = await store.getUserByToken(token);
  if (!user)
    return { error: { status: 401, body: { error: "未登录" } } };
  return { user };
}

/**
 * POST /api/polymarket/relayer/sign
 * Body JSON: { method, path, body?, timestamp? }
 * 供 @polymarket/builder-relayer-client 的 remoteBuilderConfig 调用。
 */
export async function handlePolymarketRelayerSign(req, res, readJsonBody) {
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "method not allowed" }));
    return true;
  }

  const auth = await requireAuthedUser(req);
  if (auth.error) {
    res.writeHead(auth.error.status, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(auth.error.body));
    return true;
  }

  let payload;
  try {
    payload = await readJsonBody(req);
  }
  catch (err) {
    res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: err.message || "invalid JSON body" }));
    return true;
  }

  const signed = signPolymarketRelayerRequest(payload);
  if (!signed.ok) {
    res.writeHead(signed.msg.includes("未配置") ? 503 : 400, {
      "Content-Type": "application/json; charset=utf-8",
    });
    res.end(JSON.stringify({ error: signed.msg }));
    return true;
  }

  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(signed.headers));
  return true;
}

/** GET /api/polymarket/relayer/status */
export async function handlePolymarketRelayerStatus(req, res) {
  if (req.method !== "GET") {
    res.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "method not allowed" }));
    return true;
  }

  const auth = await requireAuthedUser(req);
  if (auth.error) {
    res.writeHead(auth.error.status, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(auth.error.body));
    return true;
  }

  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({
    ...getPolymarketRelayerPublicStatus(),
    relayerUrl: getPolymarketRelayerUrl(),
  }));
  return true;
}
