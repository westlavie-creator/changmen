/**
 * platforms.json / tag_platforms.json — 与 apps/backend store 共享的本地 JSON 存储。
 */
import fs from "node:fs";
import path from "node:path";
import { ESPORT_DATA_DIR } from "./paths.js";

function filePath(name) {
  return path.join(ESPORT_DATA_DIR, `${name}.json`);
}

function readJson(name, fallback) {
  const fp = filePath(name);
  try {
    if (!fs.existsSync(fp)) return fallback;
    return JSON.parse(fs.readFileSync(fp, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(name, data) {
  fs.mkdirSync(ESPORT_DATA_DIR, { recursive: true });
  fs.writeFileSync(filePath(name), JSON.stringify(data, null, 2), "utf8");
}

/** 创建缺失的 platforms.json / tag_platforms.json（与 store.ensureSeed 一致） */
export function ensureDefaultJsonFiles() {
  const defaults = {
    platforms: {},
    tag_platforms: {},
  };
  for (const [name, def] of Object.entries(defaults)) {
    if (!fs.existsSync(filePath(name))) writeJson(name, def);
  }
}

export function getPlatform(provider) {
  return readJson("platforms", {})[provider] || null;
}

export function setPlatform(provider, data) {
  const platforms = readJson("platforms", {});
  platforms[provider] = {
    ...platforms[provider],
    ...data,
    provider,
    updatedAt: Date.now(),
  };
  writeJson("platforms", platforms);
  return platforms[provider];
}
