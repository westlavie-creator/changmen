"use strict";

const fs = require("fs");
const path = require("path");

const backendRoot = path.join(__dirname, "..");
const src = path.join(backendRoot, "..", "platform_adapter");
const dst = path.join(backendRoot, "platform_adapter");

function cpDir(s, d, skipDir) {
  fs.mkdirSync(d, { recursive: true });
  for (const n of fs.readdirSync(s)) {
    if (skipDir && skipDir(n)) continue;
    const sp = path.join(s, n);
    const dp = path.join(d, n);
    if (fs.statSync(sp).isDirectory()) cpDir(sp, dp, skipDir);
    else fs.copyFileSync(sp, dp);
  }
}

cpDir(src, dst, (n) => n === "frontend" || n === "_template");
delete require.cache[require.resolve(path.join(backendRoot, "core/shared/adapter_paths.js"))];

const ap = require(path.join(backendRoot, "core/shared/adapter_paths.js"));
console.log("packaged root:", ap.getAdapterRoot());

ap.adapterRequire("registry", "feeds.js");
const { requirePlatformRelay } = require(path.join(
  backendRoot,
  "core/shared/adapter_paths.js",
));
requirePlatformRelay("OB");
requirePlatformRelay("RAY");

const paPaths = require(path.join(ap.getAdapterRoot(), "backend/_paths.js"));
const marketCatalog = paPaths.reqS("catalog/market_catalog.js");
if (typeof marketCatalog.getDefaultMarketCode !== "function") {
  throw new Error("shared/catalog/market_catalog.js did not export getDefaultMarketCode");
}
const sharedRoot = paPaths.SHARED_ROOT;
const expectedShared = path.join(path.dirname(backendRoot), "shared");
if (path.resolve(sharedRoot) !== path.resolve(expectedShared)) {
  throw new Error(`SHARED_ROOT mismatch: ${sharedRoot} vs ${expectedShared}`);
}
console.log("shared root:", sharedRoot);

// 模拟 Electron：shared 在 resources/ 外，@supabase 在 app.asar/node_modules
const fakeResources = path.join(backendRoot, "scripts", ".tmp-packaged-resources");
const asarModules = path.join(fakeResources, "app.asar", "node_modules");
const clientPath = path.join(path.dirname(backendRoot), "shared", "db", "client.js");
try {
  fs.mkdirSync(asarModules, { recursive: true });
  const linkTarget = path.join(backendRoot, "node_modules", "@supabase");
  const linkPath = path.join(asarModules, "@supabase");
  if (!fs.existsSync(linkPath)) {
    fs.symlinkSync(linkTarget, linkPath, "junction");
  }
  const prevResourcesPath = process.resourcesPath;
  process.resourcesPath = fakeResources;
  delete require.cache[require.resolve(clientPath)];
  require(clientPath);
  process.resourcesPath = prevResourcesPath;
  console.log("shared/db/client packaged resolve OK");
} finally {
  fs.rmSync(fakeResources, { recursive: true, force: true });
}

console.log("packaged layout OK");

fs.rmSync(dst, { recursive: true, force: true });
