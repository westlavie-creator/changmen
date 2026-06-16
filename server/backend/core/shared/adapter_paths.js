/**
 * 平台 adapter 加载 — 实现位于 @changmen/platform-adapter/loader。
 */
export {
  BACKEND_ROOT,
  getAdapterRoot,
  resetAdapterRootForTests,
  initAdapterRegistry,
  initEsmPlatformBackends,
  adapterRequire,
  backendRequire,
  getRegistryPaths,
  reqS,
  resolvePlatformFile,
  requirePlatform,
} from "@changmen/platform-adapter/loader/adapter_paths.js";
