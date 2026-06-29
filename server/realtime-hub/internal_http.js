import { pushPmSportToBrowsers } from "./hub.js";

/**
 * @param {import("node:http").IncomingMessage} req
 * @returns {boolean}
 */
export function isLocalInternalRequest(req) {
  const host = String(req.headers.host || "").split(":")[0].toLowerCase();
  if (host && host !== "127.0.0.1" && host !== "localhost" && host !== "::1")
    return false;
  const remote = String(req.socket?.remoteAddress || "");
  return remote.includes("127.0.0.1") || remote === "::1" || remote === "::ffff:127.0.0.1";
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {() => Promise<object>} readBody
 */
export async function handleChangmenInternalBroadcast(req, res, readBody) {
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: false, error: "method not allowed" }));
    return true;
  }

  if (!isLocalInternalRequest(req)) {
    res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: false, error: "forbidden" }));
    return true;
  }

  let body;
  try {
    body = await readBody();
  }
  catch (err) {
    res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: false, error: err.message || "invalid body" }));
    return true;
  }

  const clientMatchId = Number(body?.clientMatchId ?? body?.ClientMatchID);
  const pmSport = body?.pmSport ?? body?.PmSport;
  if (!Number.isFinite(clientMatchId) || !pmSport || typeof pmSport !== "object") {
    res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: false, error: "clientMatchId and pmSport required" }));
    return true;
  }

  const pushed = await pushPmSportToBrowsers(clientMatchId, pmSport);
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ ok: true, pushed }));
  return true;
}
