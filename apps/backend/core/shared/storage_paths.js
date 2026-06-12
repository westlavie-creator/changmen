import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BACKEND_ROOT =
  process.env.GAMEBET_BACKEND_ROOT || path.join(__dirname, "../..");

const STORAGE_DIR =
  process.env.GAMEBET_STORAGE_DIR || path.join(BACKEND_ROOT, "storage");

const ESPORT_DATA_DIR = process.env.ESPORT_DATA_DIR || STORAGE_DIR;

function ensureStoragePaths() {
  fs.mkdirSync(ESPORT_DATA_DIR, { recursive: true });
}

ensureStoragePaths();

export { BACKEND_ROOT, STORAGE_DIR, ESPORT_DATA_DIR, ensureStoragePaths };
