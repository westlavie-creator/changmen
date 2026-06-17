import type { ServerResponse } from "node:http";
import type { Connect, Plugin, ViteDevServer } from "vite";

/** 开发时 /MATCHER 等同 /matcher/，避免 SPA 白屏（生产由 backend 处理）。 */
export function matcherDevRedirect(): Plugin {
  return {
    name: "matcher-dev-redirect",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(
        (req: Connect.IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
          const raw = req.url || "";
          const q = raw.indexOf("?");
          const path = q >= 0 ? raw.slice(0, q) : raw;
          const qs = q >= 0 ? raw.slice(q) : "";
          const m = path.match(/^\/matcher(\/.*)?$/i);
          if (!m) return next();
          const canonical = "/matcher" + (m[1] || "/");
          if (path !== canonical) {
            res.statusCode = 301;
            res.setHeader("Location", canonical + qs);
            res.end();
            return;
          }
          next();
        },
      );
    },
  };
}
