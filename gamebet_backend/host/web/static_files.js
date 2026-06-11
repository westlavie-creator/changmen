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

function createStaticHandler({ publicDir, consoleDir, webDir, matcherDir }) {
  function resolveStaticRoot(urlPath) {
    if (matcherDir && (urlPath === "/matcher" || urlPath.startsWith("/matcher/"))) {
      const fileRel =
        urlPath === "/matcher" || urlPath === "/matcher/"
          ? "/index.html"
          : urlPath.slice("/matcher".length) || "/index.html";
      return { rootDir: matcherDir, fileRel: fileRel === "/" ? "/index.html" : fileRel, spa: false };
    }
    if (urlPath === "/console" || urlPath.startsWith("/console/")) {
      const fileRel =
        urlPath === "/console"
          ? "/index.html"
          : urlPath.slice("/console".length) || "/index.html";
      return { rootDir: consoleDir, fileRel: fileRel === "/" ? "/index.html" : fileRel, spa: false };
    }
    if (urlPath.startsWith("/esport2/")) {
      return { rootDir: publicDir, fileRel: urlPath, spa: false };
    }
    const fileRel =
      urlPath === "/"
        ? "/index.html"
        : urlPath.endsWith("/") && urlPath.length > 1
          ? `${urlPath}index.html`
          : urlPath;
    return { rootDir: webDir, fileRel, spa: true };
  }

  function serveStatic(req, res) {
    const urlPath = req.url === "/" ? "/" : req.url.split("?")[0];

    if (urlPath === "/matcher") {
      res.writeHead(301, { Location: "/matcher/" });
      res.end();
      return;
    }
    if (urlPath === "/app" || urlPath === "/app/") {
      res.writeHead(301, { Location: "/" });
      res.end();
      return;
    }
    if (urlPath.startsWith("/app/")) {
      const dest = urlPath.slice("/app".length) || "/";
      res.writeHead(301, { Location: dest });
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

    sendFile(filePath, urlPath.startsWith("/console") || urlPath.startsWith("/matcher") || spa);
  }

  return serveStatic;
}

module.exports = { createStaticHandler };
