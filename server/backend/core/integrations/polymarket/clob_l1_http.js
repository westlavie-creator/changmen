import store from "../../esport-api/store.js";

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
 * [方案 C] 已废弃：禁止客户端把 privateKey POST 到 VPS；请在浏览器内派生。
 */
export async function handlePolymarketClobL1ApiCreds(req, res, _readJsonBody) {
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

  res.writeHead(410, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({
    error: "已废弃：请在浏览器内派生 Polymarket apiCreds，勿将 privateKey 提交到服务端",
  }));
  return true;
}
