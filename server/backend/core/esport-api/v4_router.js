/** v4.0 接口 — 已停用（不再转发 api.a8.to） */

const DISABLED_MSG = "v4 信用盘已停用（不再使用 api.a8.to）";

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

export async function handleV4Request(req, res, _urlPath) {
  if (req.method === "POST") {
    try {
      await readBody(req);
    }
    catch (err) {
      sendJson(res, 400, fail(err.message));
      return true;
    }
  }

  if (req.method !== "POST" && req.method !== "GET") {
    sendJson(res, 405, fail("method not allowed"));
    return true;
  }

  sendJson(res, 200, fail(DISABLED_MSG, { code: "V4Disabled" }));
  return true;
}
