import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".woff2")) return "font/woff2";
  if (filePath.endsWith(".woff")) return "font/woff";
  return "application/octet-stream";
}

function acceptsGzip(req) {
  const ae = String(req.headers["accept-encoding"] || "").toLowerCase();
  return ae.includes("gzip");
}

function isHashedAsset(urlPath) {
  return urlPath.startsWith("/assets/") && /\.[a-z0-9]+$/i.test(urlPath);
}

/** GET/HEAD 静态资源优先返回，避免在 API 链里排队导致浏览器长期 Pending */
export function isFastStaticRequest(urlPath, method) {
  if (method !== "GET" && method !== "HEAD") return false;
  return (
    urlPath.startsWith("/assets/") ||
    urlPath === "/favicon.ico" ||
    urlPath.startsWith("/esport2/")
  );
}

export function createStaticHandler({ publicDir, consoleDir, webDir, matcherDir }) {
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

  function cacheControl(urlPath, fileRel, spa, fp) {
    if (urlPath.startsWith("/console") || urlPath.startsWith("/matcher")) {
      return "no-cache, no-store, must-revalidate";
    }
    if (fileRel.endsWith(".html") || (spa && !path.extname(fileRel))) {
      return "no-cache, no-store, must-revalidate";
    }
    if (isHashedAsset(urlPath) || urlPath.startsWith("/esport2/assets/")) {
      return "public, max-age=31536000, immutable";
    }
    if (urlPath.startsWith("/assets/")) {
      return "public, max-age=86400";
    }
    return undefined;
  }

  function sendFile(req, res, fp, urlPath, fileRel, spa) {
    const type = contentType(fp);
    const cc = cacheControl(urlPath, fileRel, spa, fp);
    const baseHeaders = { "Content-Type": type };
    if (cc) baseHeaders["Cache-Control"] = cc;
    if (req.headers.origin) {
      baseHeaders["Access-Control-Allow-Origin"] = req.headers.origin;
      baseHeaders.Vary = "Origin";
    }

    const useGzip =
      acceptsGzip(req) &&
      req.method === "GET" &&
      (fp.endsWith(".js") || fp.endsWith(".css") || fp.endsWith(".json") || fp.endsWith(".html"));

    if (req.method === "HEAD") {
      fs.stat(fp, (statErr, stat) => {
        if (statErr) {
          res.writeHead(404);
          res.end();
          return;
        }
        const headers = { ...baseHeaders, "Content-Length": String(stat.size) };
        res.writeHead(200, headers);
        res.end();
      });
      return;
    }

    if (useGzip) {
      const headers = { ...baseHeaders, "Content-Encoding": "gzip", Vary: "Accept-Encoding" };
      res.writeHead(200, headers);
      fs.createReadStream(fp)
        .pipe(zlib.createGzip())
        .on("error", () => {
          if (!res.headersSent) res.writeHead(500);
          res.end();
        })
        .pipe(res);
      return;
    }

    res.writeHead(200, baseHeaders);
    const stream = fs.createReadStream(fp);
    stream.on("error", () => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
    stream.pipe(res);
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
    const rootResolved = path.resolve(rootDir);
    const filePath = path.normalize(path.join(rootResolved, fileRel));
    if (!filePath.startsWith(rootResolved)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    fs.stat(filePath, (statErr) => {
      if (statErr) {
        if (spa && !path.extname(fileRel)) {
          const indexPath = path.join(rootResolved, "index.html");
          fs.stat(indexPath, (indexErr) => {
            if (indexErr) {
              res.writeHead(404);
              res.end("Not found");
              return;
            }
            sendFile(req, res, indexPath, urlPath, "/index.html", spa);
          });
          return;
        }
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      sendFile(req, res, filePath, urlPath, fileRel, spa);
    });
  }

  return serveStatic;
}
