import { isAdminUser } from "../../backend/core/account/admin_auth.js";
import store from "../../backend/core/esport-api/store.js";
import { isMatcherSkipAuthEnabled } from "../lib/config.js";

export function isMatcherAuthBypassed() {
  return isMatcherSkipAuthEnabled();
}

export function getRequestToken(req) {
  const header
    = (typeof req.headers.token === "string" && req.headers.token)
      || (typeof req.headers.Token === "string" && req.headers.Token)
      || "";
  if (header)
    return header;
  const auth = req.headers.authorization || req.headers.Authorization;
  if (typeof auth === "string" && /^Bearer\s+/i.test(auth)) {
    return auth.replace(/^Bearer\s+/i, "").trim();
  }
  const cookies = parseCookies(req);
  const fromCookie = cookies.app_token;
  return typeof fromCookie === "string" ? fromCookie : "";
}

function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie;
  if (!raw)
    return out;
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i < 0)
      continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export async function resolveMatcherUser(req) {
  if (isMatcherAuthBypassed())
    return { user: { userName: "__skip_auth__" }, bypassed: true };
  const token = getRequestToken(req);
  if (!token)
    return { user: null, bypassed: false };
  const user = await store.getUserByToken(token);
  return { user, bypassed: false };
}

export async function isMatcherAuthed(req) {
  const { user, bypassed } = await resolveMatcherUser(req);
  if (bypassed)
    return true;
  if (!user)
    return false;
  return isAdminUser(user);
}

export function createMatcherAuthMiddleware() {
  return async (req, res, next) => {
    try {
      const path = req.path || (req.url || "").split("?")[0];
      if (!path.startsWith("/api/") && path !== "/api")
        return next();

      const { user, bypassed } = await resolveMatcherUser(req);
      if (bypassed)
        return next();
      if (!user) {
        return res.status(401).json({ ok: false, error: "unauthorized", login: "/login" });
      }
      if (!isAdminUser(user)) {
        return res.status(403).json({ ok: false, error: "forbidden", message: "需要管理员权限" });
      }
      return next();
    }
    catch (err) {
      console.error("[matcher] auth error:", err.message);
      if (!res.headersSent) {
        res.status(500).json({ ok: false, error: err.message });
      }
    }
  };
}
