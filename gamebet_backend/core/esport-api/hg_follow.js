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

export async function handleCommonApi(req, res, url) {
  const u = new URL(url, "http://127.0.0.1");
  const path = u.pathname;

  if (path === "/common/API_GetData") {
    const key = u.searchParams.get("key") || "";
    if (req.method === "POST") {
      try {
        await readBody(req);
      } catch {
        /* body optional */
      }
      if (key.startsWith("HG:")) {
        sendJson(res, 200, []);
        return true;
      }
      sendJson(res, 200, { success: 1, msg: "ok", info: { key, data: null } });
      return true;
    }
    sendJson(res, 200, { success: 1, msg: "ok", info: { key, data: null } });
    return true;
  }

  if (path.startsWith("/common/")) {
    sendJson(res, 200, { success: 1, msg: "ok", info: null });
    return true;
  }

  return false;
}
