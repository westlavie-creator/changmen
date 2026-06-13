import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { syncPlatformAdapterBackendBundle } from "../../../packages/platform-adapter/scripts/sync-backend-bundle.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const backendRoot = path.join(__dirname, "..");
const dst = syncPlatformAdapterBackendBundle();

process.env.GAMEBET_ADAPTER_ROOT = dst;

const {
  getAdapterRoot,
  adapterRequire,
  initAdapterRegistry,
  initEsmPlatformBackends,
  requirePlatform,
  resetAdapterRootForTests,
} = await import("../core/shared/adapter_paths.js");

resetAdapterRootForTests();
await initAdapterRegistry();
await initEsmPlatformBackends();

console.log("packaged root:", getAdapterRoot());
if (path.resolve(getAdapterRoot()) !== path.resolve(dst)) {
  throw new Error(`expected packaged root ${dst}, got ${getAdapterRoot()}`);
}

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
console.log("shared resolve OK:", marketCatalog.getDefaultMarketCode("OB"));

// 模拟 Electron：shared 在 resources/ 外，@supabase 在 app.asar/node_modules
const fakeResources = path.join(backendRoot, "scripts", ".tmp-packaged-resources");
const asarModules = path.join(fakeResources, "app.asar", "node_modules");
const clientPath = path.join(backendRoot, "..", "..", "packages", "db", "client.js");
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
  console.log("packages/db/client packaged resolve OK");
} finally {
  fs.rmSync(fakeResources, { recursive: true, force: true });
}

console.log("packaged layout OK");

delete process.env.GAMEBET_ADAPTER_ROOT;
fs.rmSync(dst, { recursive: true, force: true });
