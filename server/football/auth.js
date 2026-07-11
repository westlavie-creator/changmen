import crypto from "node:crypto";

function jwtSecret() {
  return String(process.env.JWT_SECRET || "").trim();
}

export function isAuthConfigured() {
  return jwtSecret().length >= 16;
}

function verifyJwt(token, secret) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3)
    return null;
  const [h, p, sig] = parts;
  const expected = crypto.createHmac("sha256", secret).update(`${h}.${p}`).digest("base64url");
  if (sig !== expected)
    return null;
  try {
    const payload = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
    if (payload.exp && payload.exp * 1000 < Date.now())
      return null;
    return payload;
  }
  catch {
    return null;
  }
}

function readTokenFromCookie(req) {
  const raw = String(req.headers.cookie || "");
  const m = raw.match(/(?:^|;\s*)app_token=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : "";
}

/** @param {import('node:http').IncomingMessage} req */
export function readAuthToken(req) {
  const header = String(req.headers.token ?? req.headers.Token ?? "").trim();
  if (header)
    return header;
  const auth = String(req.headers.authorization ?? "");
  if (auth.toLowerCase().startsWith("bearer "))
    return auth.slice(7).trim();
  return readTokenFromCookie(req);
}

/** @param {import('node:http').IncomingMessage} req */
export function verifyRequestAuth(req) {
  const secret = jwtSecret();
  if (!secret || secret.length < 16)
    return { ok: false, status: 503, error: "JWT_SECRET 未配置" };
  const token = readAuthToken(req);
  if (!token)
    return { ok: false, status: 401, error: "请先登录" };
  const payload = verifyJwt(token, secret);
  if (!payload)
    return { ok: false, status: 401, error: "登录已失效" };
  return { ok: true, payload };
}
