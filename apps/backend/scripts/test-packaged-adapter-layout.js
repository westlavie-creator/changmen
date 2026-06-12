import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import {
  getAdapterRoot,
  adapterRequire,
  initAdapterRegistry,
  requirePlatform,
} from "../core/shared/adapter_paths.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const backendRoot = path.join(__dirname, "..");
const src = path.join(backendRoot, "..", "..", "packages", "platform-adapter");
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

await initAdapterRegistry();

console.log("packaged root:", getAdapterRoot());

adapterRequire("registry", "feeds.js");
requirePlatform("OB", "backend", "session.js");
requirePlatform("RAY", "backend", "session.js");

const paPaths = await import(
  pathToFileURL(path.join(getAdapterRoot(), "backend/_paths.js")).href
);
const marketCatalog = paPaths.reqS("catalog/market_catalog.mjs");
if (typeof marketCatalog.getDefaultMarketCode !== "function") {
  throw new Error("shared/catalog/market_catalog.mjs did not export getDefaultMarketCode");
}
const sharedRoot = paPaths.SHARED_ROOT;
const expectedShared = path.join(backendRoot, "..", "..", "packages", "shared");
if (path.resolve(sharedRoot) !== path.resolve(expectedShared)) {
  throw new Error(`SHARED_ROOT mismatch: ${sharedRoot} vs ${expectedShared}`);
}
console.log("shared root:", sharedRoot);

// 模拟 Electron：shared 在 resources/ 外，@supabase 在 app.asar/node_modules
const fakeResources = path.join(backendRoot, "scripts", ".tmp-packaged-resources");
const asarModules = path.join(fakeResources, "app.asar", "node_modules");
const clientPath = path.join(backendRoot, "..", "..", "packages", "shared", "db", "client.js");
try {
  fs.mkdirSync(asarModules, { recursive: true });
  const linkTarget = path.join(backendRoot, "node_modules", "@supabase");
  const linkPath = path.join(asarModules, "@supabase");
  if (!fs.existsSync(linkPath)) {
    fs.symlinkSync(linkTarget, linkPath, "junction");
  }
  const prevResourcesPath = process.resourcesPath;
  process.resourcesPath = fakeResources;
  const clientUrl = pathToFileURL(clientPath).href;
  await import(`${clientUrl}?packaged-test=${Date.now()}`);
  process.resourcesPath = prevResourcesPath;
  console.log("shared/db/client packaged resolve OK");
} finally {
  fs.rmSync(fakeResources, { recursive: true, force: true });
}

console.log("packaged layout OK");

fs.rmSync(dst, { recursive: true, force: true });
