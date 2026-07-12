#!/usr/bin/env node
/**
 * 构建 Gamebet Chrome 扩展：可读 background + esbuild 打包 content。
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import esbuild from "esbuild";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function copy(from, to) {
  fs.copyFileSync(path.join(root, from), path.join(root, to));
  console.log("copied", to);
}

function syncVersionJson() {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
  fs.writeFileSync(
    path.join(root, "version.json"),
    `${JSON.stringify({ version: manifest.version }, null, 2)}\n`,
    "utf8",
  );
  console.log("wrote version.json", manifest.version);
}

async function bundleSocketIo() {
  const entry = path.join(
    root,
    "../web/node_modules/socket.io-client/build/esm/index.js",
  );
  if (!fs.existsSync(entry)) {
    console.warn("skip socket.io bundle — install client/web deps first");
    return;
  }
  await esbuild.build({
    entryPoints: [entry],
    outfile: path.join(root, "vendor/socket.io.bundle.js"),
    bundle: true,
    format: "iife",
    globalName: "io",
    platform: "browser",
  });
  console.log("bundled vendor/socket.io.bundle.js");
}

async function bundleContent() {
  await esbuild.build({
    entryPoints: [path.join(root, "src/content/index.js")],
    outfile: path.join(root, "content.js"),
    bundle: true,
    format: "iife",
    platform: "browser",
    target: ["chrome109"],
  });
  console.log("bundled content.js");
}

async function bundleBackground() {
  await esbuild.build({
    entryPoints: [path.join(root, "src/background/index.js")],
    outfile: path.join(root, "background.js"),
    bundle: true,
    format: "iife",
    platform: "browser",
    target: ["chrome109"],
  });
  console.log("bundled background.js");
}

await bundleBackground();
await bundleSocketIo();
await bundleContent();
syncVersionJson();
