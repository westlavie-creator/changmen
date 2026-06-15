import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export const {
  CHANGMEN_ROOT,
  BACKEND_ROOT,
  STORAGE_DIR,
  ESPORT_DATA_DIR,
  ensureStoragePaths,
} = require("./paths.cjs");
