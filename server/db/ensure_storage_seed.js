/**
 * 首次启动时创建 storage/*.json（不覆盖已有文件）。
 */
import fs from "node:fs";
import path from "node:path";
import { BACKEND_ROOT, ESPORT_DATA_DIR } from "./paths.js";
import { readJsonFile, writeJsonFile } from "./json_file_store.js";

const EMPTY_OBJECTS = [
  "tag_platforms",
  "players",
  "player_orders",
  "default_odds",
  "sessions",
];

export function ensureDefaultJsonFiles() {
  if (!fs.existsSync(filePath("platforms"))) {
    const example = path.join(BACKEND_ROOT, "platforms.example.json");
    if (fs.existsSync(example)) {
      fs.mkdirSync(ESPORT_DATA_DIR, { recursive: true });
      fs.copyFileSync(example, filePath("platforms"));
    } else {
      writeJsonFile("platforms", {});
    }
  }
  if (!fs.existsSync(filePath("tag_platforms"))) {
    writeJsonFile("tag_platforms", {});
  }
}

export function ensureStorageSeed() {
  ensureDefaultJsonFiles();
  for (const name of EMPTY_OBJECTS) {
    if (name === "tag_platforms") continue;
    if (!fs.existsSync(filePath(name))) {
      writeJsonFile(name, {});
    }
  }
}

function filePath(name) {
  return path.join(ESPORT_DATA_DIR, `${name}.json`);
}
