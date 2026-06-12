import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import manifest from "./manifest.json" with { type: "json" };

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const REGISTRY_ROOT = __dirname;
const ADAPTER_ROOT = path.join(REGISTRY_ROOT, "..");

function resolveBackendRoot() {
  const monorepo = path.join(ADAPTER_ROOT, "..", "..", "gamebet_backend");
  if (fs.existsSync(path.join(monorepo, "core"))) {
    return monorepo;
  }
  const legacy = path.join(ADAPTER_ROOT, "..", "gamebet_backend");
  if (fs.existsSync(path.join(legacy, "core"))) {
    return legacy;
  }
  throw new Error(
    "gamebet_backend not found (expected changmen/gamebet_backend next to packages/)",
  );
}

export const BACKEND_ROOT = resolveBackendRoot();

/** @typedef {import("./manifest.json")[number]} PlatformManifestEntry */

/** @type {PlatformManifestEntry[]} */
export const MANIFEST = manifest;

export function normalizePlatformId(id) {
  const key = String(id || "").trim();
  if (key.toUpperCase() === "XBET") return "XBet";
  const hit = MANIFEST.find((p) => p.id.toUpperCase() === key.toUpperCase());
  return hit ? hit.id : key;
}

export function getManifestEntry(id) {
  const normalized = normalizePlatformId(id);
  return MANIFEST.find((p) => p.id === normalized) || null;
}

export function platformDir(id) {
  return getManifestEntry(id)?.dir || String(id || "").toLowerCase();
}

/** platform_adapter/{dir}/... */
export function resolvePlatformFile(id, ...segments) {
  const dir = platformDir(id);
  return path.join(ADAPTER_ROOT, dir, ...segments);
}

export function platformAdapterPath(id, ...segments) {
  return path.join(ADAPTER_ROOT, platformDir(id), ...segments);
}

export { ADAPTER_ROOT };
