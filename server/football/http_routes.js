import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getFootballCache, queryFootballCache } from "./cache.js";
import { isAuthConfigured, verifyRequestAuth } from "./auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UI_DIR = path.join(__dirname, "ui", "public");

function jsonResponse(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function contentType(filePath) {
  if (filePath.endsWith(".html"))
    return "text/html; charset=utf-8";
  if (filePath.endsWith(".css"))
    return "text/css; charset=utf-8";
  if (filePath.endsWith(".js"))
    return "text/javascript; charset=utf-8";
  return "application/octet-stream";
}

function parseQuery(url) {
  const u = new URL(url, "http://local");
  /** @type {Record<string, string>} */
  const out = {};
  u.searchParams.forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

function normalizePath(urlPath) {
  const q = urlPath.indexOf("?");
  const pathname = q >= 0 ? urlPath.slice(0, q) : urlPath;
  return pathname.replace(/\/+$/, "") || "/";
}

function serveStatic(res, relPath) {
  const filePath = path.join(UI_DIR, relPath);
  if (!filePath.startsWith(UI_DIR))
    return false;
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile())
    return false;
  const data = fs.readFileSync(filePath);
  res.writeHead(200, { "Content-Type": contentType(filePath), "Cache-Control": "no-cache" });
  res.end(data);
  return true;
}

function handleApiHealth(res) {
  const cache = getFootballCache();
  jsonResponse(res, 200, {
    ok: true,
    builtAt: cache.builtAt,
    matchCount: cache.matches.length,
    leagueCount: cache.leagues.length,
    refreshing: cache.refreshing,
    lastError: cache.lastError,
    authConfigured: isAuthConfigured(),
  });
}

function handleApiMatches(req, res, query) {
  const auth = verifyRequestAuth(req);
  if (!auth.ok)
    return jsonResponse(res, auth.status, { ok: false, error: auth.error });

  const result = queryFootballCache({
    league: query.league,
    status: query.status,
    q: query.q,
    pageIndex: Number(query.pageIndex || query.page || 1),
    pageSize: Number(query.pageSize || query.size || 50),
  });
  jsonResponse(res, 200, { ok: true, ...result });
}

function handleApiLeagues(req, res) {
  const auth = verifyRequestAuth(req);
  if (!auth.ok)
    return jsonResponse(res, auth.status, { ok: false, error: auth.error });
  const cache = getFootballCache();
  jsonResponse(res, 200, {
    ok: true,
    list: cache.leagues,
    builtAt: cache.builtAt,
  });
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
export function handleFootballRequest(req, res) {
  const method = req.method || "GET";
  const pathname = normalizePath(req.url || "/");
  const query = parseQuery(req.url || "/");

  if (method === "GET" && pathname === "/football/api/health")
    return handleApiHealth(res);

  if (method === "GET" && pathname === "/football/api/matches")
    return handleApiMatches(req, res, query);

  if (method === "GET" && pathname === "/football/api/leagues")
    return handleApiLeagues(req, res);

  if ((method === "GET" || method === "HEAD") && pathname === "/") {
    res.writeHead(302, { Location: "/football/" });
    res.end();
    return;
  }

  if (method !== "GET" && method !== "HEAD") {
    res.writeHead(405);
    res.end("Method Not Allowed");
    return;
  }

  if (pathname === "/football" || pathname === "/football/index.html") {
    if (serveStatic(res, "index.html"))
      return;
  }

  if (pathname.startsWith("/football/")) {
    const rel = pathname.slice("/football".length) || "/index.html";
    if (serveStatic(res, rel === "/" ? "index.html" : rel))
      return;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
}
