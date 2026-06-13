import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const LOADER_DIR = __dirname;
const PLATFORM_ADAPTER_ROOT = path.join(LOADER_DIR, "..");

function findChangmenRoot(startDir) {
  let cur = startDir;
  for (let i = 0; i < 12; i++) {
    const pkgPath = path.join(cur, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
        if (pkg.name === "gamebet") return cur;
      } catch {
        /* ignore */
      }
    }
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  throw new Error(`changmen root not found from ${startDir}`);
}

const CHANGMEN_ROOT = findChangmenRoot(PLATFORM_ADAPTER_ROOT);

/** apps/backend 根目录 */
export const BACKEND_ROOT = path.join(CHANGMEN_ROOT, "apps", "backend");

let _adapterRoot;
let _registryPaths;
let _registryFeeds;
let _registryReady;
/** @type {Map<string, Record<string, unknown>>} */
const _esmPlatformModuleCache = new Map();

/**
 * platform-adapter 根目录。
 * - 开发：changmen/packages/platform-adapter
 * - 可选拷贝：`apps/backend/platform_adapter`（部署脚本复制时，目录名仍为 platform_adapter）
 */
export function getAdapterRoot() {
  if (_adapterRoot) return _adapterRoot;

  if (fs.existsSync(path.join(PLATFORM_ADAPTER_ROOT, "registry", "manifest.json"))) {
    _adapterRoot = PLATFORM_ADAPTER_ROOT;
    return _adapterRoot;
  }

  const bundled = path.join(BACKEND_ROOT, "platform_adapter");
  if (fs.existsSync(path.join(bundled, "registry", "manifest.json"))) {
    _adapterRoot = bundled;
    return _adapterRoot;
  }

  const legacy = path.join(CHANGMEN_ROOT, "platform_adapter");
  if (fs.existsSync(path.join(legacy, "registry", "manifest.json"))) {
    _adapterRoot = legacy;
    return _adapterRoot;
  }

  throw new Error(
    "platform-adapter not found: expected packages/platform-adapter (dev) or apps/backend/platform_adapter (packaged)",
  );
}

/** 预加载 registry ESM（paths.js / feeds.js）；server 入口须在加载 http_routes 前 await */
export async function initAdapterRegistry() {
  if (_registryReady) return _registryReady;

  _registryReady = (async () => {
    const root = getAdapterRoot();
    const registryDir = path.join(root, "registry");
    const pathsUrl = pathToFileURL(path.join(registryDir, "paths.js")).href;
    const feedsUrl = pathToFileURL(path.join(registryDir, "feeds.js")).href;
    _registryPaths = await import(pathsUrl);
    _registryFeeds = await import(feedsUrl);
  })();

  return _registryReady;
}

function ensureRegistryLoaded() {
  if (!_registryPaths || !_registryFeeds) {
    throw new Error(
      "platform_adapter registry not loaded; await initAdapterRegistry() before adapterRequire(registry/*)",
    );
  }
}

/** require(platform_adapter 下的相对路径片段) — 平台 backend 仍为 CJS */
export function adapterRequire(...segments) {
  const key = segments.join("/");
  if (key === "registry/paths.js") {
    ensureRegistryLoaded();
    return _registryPaths;
  }
  if (key === "registry/feeds.js") {
    ensureRegistryLoaded();
    return _registryFeeds;
  }
  return require(path.join(getAdapterRoot(), ...segments));
}

export function getRegistryPaths() {
  ensureRegistryLoaded();
  return _registryPaths;
}

export function resolvePlatformFile(id, ...segments) {
  return getRegistryPaths().resolvePlatformFile(id, ...segments);
}

/** 预加载已迁 ESM 的平台 backend/*.js（顶层 .js，不含 scripts/） */
export async function initEsmPlatformBackends() {
  ensureRegistryLoaded();
  const root = getAdapterRoot();
  for (const entry of _registryPaths.MANIFEST) {
    const backendDir = path.join(root, entry.dir, "backend");
    const pkgPath = path.join(backendDir, "package.json");
    if (!fs.existsSync(pkgPath)) continue;
    let pkg;
    try {
      pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    } catch {
      continue;
    }
    if (pkg.type !== "module") continue;
    for (const file of fs.readdirSync(backendDir)) {
      if (!file.endsWith(".js") || file.startsWith("_")) continue;
      const abs = path.join(backendDir, file);
      if (!fs.statSync(abs).isFile()) continue;
      if (!_esmPlatformModuleCache.has(abs)) {
        _esmPlatformModuleCache.set(abs, await import(pathToFileURL(abs).href));
      }
    }
  }
}

function loadPlatformModule(abs) {
  if (_esmPlatformModuleCache.has(abs)) {
    return _esmPlatformModuleCache.get(abs);
  }
  try {
    return require(abs);
  } catch (err) {
    if (err?.code === "ERR_REQUIRE_ESM") {
      throw new Error(
        `ESM platform module not preloaded: ${abs} (await initEsmPlatformBackends())`,
      );
    }
    throw err;
  }
}

/** require(platform_adapter/{dir}/...) — ESM 平台走预加载缓存 */
export function requirePlatform(id, ...segments) {
  return loadPlatformModule(resolvePlatformFile(id, ...segments));
}

await initAdapterRegistry();
await initEsmPlatformBackends();
