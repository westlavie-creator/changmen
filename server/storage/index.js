/**
 * @changmen/storage — 本地 JSON 与 monorepo 路径（非 PostgreSQL）。
 */
export {
  CHANGMEN_ROOT,
  BACKEND_ROOT,
  STORAGE_DIR,
  ESPORT_DATA_DIR,
  ensureStoragePaths,
  findChangmenRoot,
} from "./paths.js";

export { CHANGMEN_ROOT_FROM_PKG } from "./changmen_root.js";

export {
  readJsonFile,
  writeJsonFile,
  writeJsonFileDebounced,
  flushJsonFileDebounced,
} from "./json_file_store.js";

export {
  ensureDefaultJsonFiles,
  ensureStorageSeed,
  getPlatform,
  setPlatform,
} from "./platform_storage.js";

export { loadChangmenEnv } from "./load_env.js";
