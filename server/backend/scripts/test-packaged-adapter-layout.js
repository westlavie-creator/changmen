import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { syncPlatformAdapterBackendBundle } from "../../../client/platform-adapter/scripts/sync-backend-bundle.mjs";
import { syncPlatformNodeBundle } from "../../../devtools/platform-probes/scripts/sync-backend-bundle.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const adapterDst = syncPlatformAdapterBackendBundle();
const nodeDst = syncPlatformNodeBundle();

process.env.GAMEBET_ADAPTER_ROOT = adapterDst;
process.env.GAMEBET_NODE_ROOT = nodeDst;

const {
  getAdapterRoot,
  adapterRequire,
  initAdapterRegistry,
  initEsmPlatformBackends,
  requirePlatform,
  resetAdapterRootForTests,
} = await import("../core/shared/adapter_paths.js");

resetAdapterRootForTests();
process.env.GAMEBET_ADAPTER_ROOT = adapterDst;
process.env.GAMEBET_NODE_ROOT = nodeDst;
await initAdapterRegistry();
await initEsmPlatformBackends();

console.log("packaged adapter:", getAdapterRoot());
if (path.resolve(getAdapterRoot()) !== path.resolve(adapterDst)) {
  throw new Error(`expected packaged adapter ${adapterDst}, got ${getAdapterRoot()}`);
}

adapterRequire("registry", "feeds.js");
requirePlatform("OB", "node", "session.js");
requirePlatform("RAY", "node", "session.js");

const paPaths = await import(
  pathToFileURL(path.join(getAdapterRoot(), "backend/_paths.js")).href
);
const marketCatalog = paPaths.reqS("catalog/market_catalog.mjs");
if (typeof marketCatalog.getDefaultMarketCode !== "function") {
  throw new Error("shared/catalog/market_catalog.mjs did not export getDefaultMarketCode");
}
console.log("shared resolve OK:", marketCatalog.getDefaultMarketCode("OB"));

console.log("packaged layout OK");

delete process.env.GAMEBET_ADAPTER_ROOT;
delete process.env.GAMEBET_NODE_ROOT;
fs.rmSync(adapterDst, { recursive: true, force: true });
fs.rmSync(nodeDst, { recursive: true, force: true });
