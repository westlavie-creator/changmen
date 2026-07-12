import store from "../../esport-api/store.js";
import { createOrDerivePolymarketApiCredsOnServer } from "./clob_l1.js";

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
 * POST /api/polymarket/clob/create-or-derive-api-creds
 * Body: { privateKey, gateway?, walletAddress? }
 */
export async function handlePolymarketClobL1ApiCreds(req, res, readJsonBody) {
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

  const privateKey = String(payload?.privateKey ?? "").trim();
  if (!privateKey) {
    res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "privateKey required" }));
    return true;
  }

  try {
    const result = await createOrDerivePolymarketApiCredsOnServer({
      privateKey,
      gateway: payload?.gateway,
      walletAddress: payload?.walletAddress,
    });
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(result));
    return true;
  }
  catch (err) {
    const status = Number(err?.status) >= 400 && Number(err?.status) < 600 ? Number(err.status) : 400;
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    return true;
  }
}
