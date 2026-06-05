"use strict";

const fs = require("fs");
const path = require("path");

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  return "application/octet-stream";
}

function createStaticHandler({ publicDir, consoleDir, appDir }) {
  function resolveStaticRoot(urlPath) {
    if (urlPath === "/console" || urlPath.startsWith("/console/")) {
      const fileRel =
        urlPath === "/console"
          ? "/index.html"
          : urlPath.slice("/console".length) || "/index.html";
      return { rootDir: consoleDir, fileRel: fileRel === "/" ? "/index.html" : fileRel, spa: false };
    }
    if (urlPath === "/app" || urlPath.startsWith("/app/")) {
      const fileRel =
        urlPath === "/app" ? "/index.html" : urlPath.slice("/app".length) || "/index.html";
      return { rootDir: appDir, fileRel: fileRel === "/" ? "/index.html" : fileRel, spa: true };
    }
    let fileRel = urlPath;
    if (urlPath.endsWith("/") && urlPath.length > 1) {
      fileRel = `${urlPath}index.html`;
    }
    return { rootDir: publicDir, fileRel, spa: false };
  }

  function serveStatic(req, res) {
    const urlPath = req.url === "/" ? "/" : req.url.split("?")[0];

    if (urlPath === "/" || urlPath === "/index.html") {
      res.writeHead(302, { Location: "/app/" });
      res.end();
      return;
    }

    const { rootDir, fileRel, spa } = resolveStaticRoot(urlPath);
    const filePath = path.normalize(path.join(rootDir, fileRel));
    if (!filePath.startsWith(rootDir)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    const sendFile = (fp, cacheBust) => {
      fs.readFile(fp, (readErr, data) => {
        if (readErr) {
          if (spa && !path.extname(fileRel)) {
            const indexPath = path.join(rootDir, "index.html");
            fs.readFile(indexPath, (indexErr, indexData) => {
              if (indexErr) {
                res.writeHead(404);
                res.end("Not found");
                return;
              }
              res.writeHead(200, {
                "Content-Type": "text/html; charset=utf-8",
                "Cache-Control": "no-cache, no-store, must-revalidate",
              });
              res.end(indexData);
            });
            return;
          }
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        const headers = { "Content-Type": contentType(fp) };
        if (cacheBust) {
          headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
        }
        res.writeHead(200, headers);
        res.end(data);
      });
    };

    sendFile(filePath, urlPath.startsWith("/console") || urlPath.startsWith("/app"));
  }

  return serveStatic;
}

module.exports = { createStaticHandler };
