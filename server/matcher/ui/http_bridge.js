import { createMatcherApiApp } from "./create_matcher_api_app.js";

function splitUrl(url) {
  const raw = url || "/";
  const q = raw.indexOf("?");
  if (q < 0) return { pathname: raw, search: "" };
  return { pathname: raw.slice(0, q), search: raw.slice(q) };
}

/**
 * 将 server/backend 收到的 /matcher/api/* 转给 matcher Express 应用。
 * @returns {Promise<boolean>} 是否已接管请求
 */
export function tryHandleMatcherApi(req, res) {
  const { pathname, search } = splitUrl(req.url);
  const matcherApiPrefix = "/matcher/api";
  const lower = pathname.toLowerCase();
  if (!lower.startsWith(matcherApiPrefix + "/") && lower !== matcherApiPrefix) {
    return Promise.resolve(false);
  }

  let app;
  try {
    app = createMatcherApiApp();
  } catch (err) {
    res.writeHead(503, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: false, error: err.message }));
    return Promise.resolve(true);
  }

  const saved = req.url;
  req.url = pathname.slice(pathname.toLowerCase().indexOf("/matcher") + "/matcher".length) + search;

  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      req.url = saved;
      resolve(true);
    };
    res.on("finish", done);
    res.on("close", done);
    app(req, res, () => {
      if (!res.headersSent) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Not found");
      }
      done();
    });
  });
}
