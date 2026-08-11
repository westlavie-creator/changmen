/**
 * Hub 连接归因（健康页 userId / userName）。
 * 行情不鉴权：token 缺失/无效仍放行。
 *
 * 硬依赖：JWT_SECRET（peek access token）。
 * 软依赖：@changmen/db（有 DATABASE_URL 时才动态加载，用来查登录名）。
 */
import crypto from "node:crypto";

function jwtSecret() {
  return String(process.env.JWT_SECRET || "").trim();
}

function hasDatabaseUrl() {
  return !!(
    process.env.DATABASE_URL
    || process.env.DATABASE_URL_PUBLIC
    || process.env.DATABASE_URL_INTERNAL
  );
}

/** @param {string} token @param {string} secret */
function verifyHs256(token, secret) {
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

/**
 * 只验 access JWT 签名/过期，不查 session。
 * @returns {{ userId: string } | null}
 */
export function peekHubAccessToken(token) {
  const secret = jwtSecret();
  if (!token || !secret)
    return null;
  const payload = verifyHs256(token, secret);
  if (!payload?.sub || payload.typ !== "access")
    return null;
  return { userId: String(payload.sub) };
}

/** @param {string} userId */
async function lookupUserName(userId) {
  if (!userId || !hasDatabaseUrl())
    return "";
  try {
    const { fetchUserById } = await import("@changmen/db");
    const user = await fetchUserById(userId);
    return String(user?.user_name || "").trim();
  }
  catch {
    return "";
  }
}

/**
 * @param {string} token
 * @returns {Promise<{ userId: string, userName: string } | null>}
 */
export async function resolveHubIdentity(token) {
  if (!token)
    return null;
  const peek = peekHubAccessToken(token);
  if (!peek)
    return null;
  const userName = await lookupUserName(peek.userId);
  return { userId: peek.userId, userName };
}

/** 有库才 init；失败不挡 listen。 */
export async function initHubIdentity() {
  if (!hasDatabaseUrl())
    return false;
  try {
    const { initDatabaseUrl } = await import("@changmen/db");
    await initDatabaseUrl();
    return true;
  }
  catch (err) {
    console.warn(
      "[hub-identity] initDatabaseUrl failed — userName lookup disabled:",
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}
