/**
 * 非 esport 路径耗时观测：仅慢请求打日志，不写入 esport_request_timing
 *（避免污染 /health 的 esportApi 卡片）。
 *
 * 必须等 finish/close：serveStatic 会先 writeHead 再 pipe，headersSent 时响应可能尚未结束。
 */

const SLOW_MS = 500;

/**
 * @type {import("./compose.js").HttpMiddleware}
 */
export async function withTiming(req, res, next) {
  const t0 = Date.now();
  let logged = false;
  const logSlow = () => {
    if (logged)
      return;
    logged = true;
    const ms = Date.now() - t0;
    if (ms < SLOW_MS)
      return;
    const path = req.pathname || String(req.url || "").split("?")[0] || "";
    console.warn(
      `[http] slow ${req.reqId || "-"} ${req.method || "?"} ${path} ${ms}ms`,
    );
  };
  try {
    await next();
  }
  finally {
    if (res.writableEnded) {
      logSlow();
    }
    else {
      res.once("finish", logSlow);
      res.once("close", logSlow);
    }
  }
}
