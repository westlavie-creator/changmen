/**
 * platforms.json / tag_platforms.json — 与 server/backend store 共享的本地 JSON 存储。
 */
import { readJsonFile, writeJsonFile } from "./json_file_store.js";
import { ensureDefaultJsonFiles, ensureStorageSeed } from "./ensure_storage_seed.js";

export { ensureDefaultJsonFiles, ensureStorageSeed };

export function getPlatform(provider) {
  return readJsonFile("platforms", {})[provider] || null;
}

export function setPlatform(provider, data) {
  const platforms = readJsonFile("platforms", {});
  platforms[provider] = {
    ...platforms[provider],
    ...data,
    provider,
    updatedAt: Date.now(),
  };
  writeJsonFile("platforms", platforms);
  return platforms[provider];
}
