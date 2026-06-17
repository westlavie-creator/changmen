import fs from "node:fs";
import path from "node:path";
import { CHANGMEN_ROOT_FROM_DB_PKG, findChangmenRoot } from "./changmen_root.js";

export { findChangmenRoot };

export const CHANGMEN_ROOT = CHANGMEN_ROOT_FROM_DB_PKG;

export const BACKEND_ROOT =
  process.env.GAMEBET_BACKEND_ROOT || path.join(CHANGMEN_ROOT, "server", "backend");

export const STORAGE_DIR =
  process.env.GAMEBET_STORAGE_DIR || path.join(BACKEND_ROOT, "storage");

export const ESPORT_DATA_DIR = process.env.ESPORT_DATA_DIR || STORAGE_DIR;

export function ensureStoragePaths() {
  fs.mkdirSync(ESPORT_DATA_DIR, { recursive: true });
}

ensureStoragePaths();
