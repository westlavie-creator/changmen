import store from "../../gamebet_backend/core/esport-api/store.js";

function isLocalRequest(req) {
  const host = String(req?.headers?.host || "").split(":")[0].toLowerCase();
  return host === "localhost" || host === "127.0.0.1";
}

export function isMatcherAuthBypassed(req) {
  if (process.env.MATCHER_SKIP_AUTH === "1") return true;
  if (process.env.NODE_ENV === "development") return true;
  if (req && isLocalRequest(req)) return true;
  return false;
}

export function getRequestToken(req) {
  const header =
    (typeof req.headers.token === "string" && req.headers.token) ||
    (typeof req.headers.Token === "string" && req.headers.Token) ||
    "";
  if (header) return header;
  const cookies = parseCookies(req);
  const fromCookie = cookies.app_token;
  return typeof fromCookie === "string" ? fromCookie : "";
}

function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie;
  if (!raw) return out;
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export async function isMatcherAuthed(req) {
  if (isMatcherAuthBypassed(req)) return true;
  const user = await store.getUserBySupabaseToken(getRequestToken(req));
  return !!user;
}

export function createMatcherAuthMiddleware() {
  return async (req, res, next) => {
    try {
      const path = req.path || (req.url || "").split("?")[0];
      if (!path.startsWith("/api/") && path !== "/api") return next();
      if (await isMatcherAuthed(req)) return next();
      res.status(401).json({ ok: false, error: "unauthorized", login: "/login" });
    } catch (err) {
      console.error("[matcher] auth error:", err.message);
      if (!res.headersSent) {
        res.status(500).json({ ok: false, error: err.message });
      }
    }
  };
}
