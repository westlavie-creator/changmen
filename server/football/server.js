import "./load_env.js";
import http from "node:http";
import { handleFootballRequest } from "./http_routes.js";
import { startFootballLoop } from "./loop.js";
import { isAuthConfigured } from "./auth.js";

const PORT = Number(process.env.FOOTBALL_PORT || 3457);

const server = http.createServer((req, res) => {
  try {
    handleFootballRequest(req, res);
  }
  catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[changmen-football] request error:", msg);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Internal Server Error");
    }
  }
});

startFootballLoop();

server.listen(PORT, () => {
  console.log(
    `[changmen-football] http://127.0.0.1:${PORT}/football/  auth=${isAuthConfigured() ? "jwt" : "MISSING_JWT_SECRET"}`,
  );
});
