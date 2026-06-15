import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import manifest from "./manifest.json" with { type: "json" };
import { BACKEND_ROOT, CHANGMEN_ROOT } from "@changmen/db/paths.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const REGISTRY_ROOT = __dirname;
const ADAPTER_ROOT = path.join(REGISTRY_ROOT, "..");
const DEFAULT_PROBES_ROOT = path.join(CHANGMEN_ROOT, "devtools", "platform-probes");

/** @typedef {import("./manifest.json")[number]} PlatformManifestEntry */

/** @type {PlatformManifestEntry[]} */
export const MANIFEST = manifest;

let _platformNodeRootOverride;

/** 测试用：覆盖 Node 包根目录 */
export function resetPlatformNodeRootForTests() {
  _platformNodeRootOverride = undefined;
}

export function setPlatformNodeRootForTests(abs) {
  _platformNodeRootOverride = abs;
}

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

/** requirePlatform 第二段字面量（历史兼容 `"backend"`） */
export const PLATFORM_NODE_DIR = "node";

function probesRootLooksValid(abs) {
  return fs.existsSync(path.join(abs, "ob", "session.js"));
}

/**
 * @changmen/platform-probes 包根（与 platform-adapter 并列）。
 * - `GAMEBET_PLATFORM_PROBES_ROOT` / `GAMEBET_NODE_ROOT`（瘦包 / 测试）
 * - 开发：`changmen/devtools/platform-probes`
 * - 瘦包：`server/backend/platform_node`（历史目录名，同步产物）
 */
export function getPlatformNodeRoot() {
  if (_platformNodeRootOverride) return _platformNodeRootOverride;

  const forced =
    process.env.GAMEBET_PLATFORM_PROBES_ROOT?.trim() || process.env.GAMEBET_NODE_ROOT?.trim();
  if (forced) {
    const abs = path.resolve(forced);
    if (probesRootLooksValid(abs)) return abs;
    throw new Error(`GAMEBET_PLATFORM_PROBES_ROOT invalid (no ob/session.js): ${abs}`);
  }

  if (probesRootLooksValid(DEFAULT_PROBES_ROOT)) return DEFAULT_PROBES_ROOT;

  const bundled = path.join(BACKEND_ROOT, "platform_node");
  if (probesRootLooksValid(bundled)) {
    return bundled;
  }

  throw new Error(
    `platform-probes not found: expected devtools/platform-probes (dev) or server/backend/platform_node (packaged); ` +
      `set GAMEBET_PLATFORM_PROBES_ROOT if using a custom path`,
  );
}

function normalizeNodeSegments(segments) {
  if (segments[0] === "backend" || segments[0] === PLATFORM_NODE_DIR) {
    return [PLATFORM_NODE_DIR, ...segments.slice(1)];
  }
  return segments;
}

/** `requirePlatform(id, "node", …)` → `platform-probes/{dir}/…` */
export function resolvePlatformFile(id, ...segments) {
  const dir = platformDir(id);
  const normalized = normalizeNodeSegments(segments);
  if (normalized[0] === PLATFORM_NODE_DIR) {
    return path.join(getPlatformNodeRoot(), dir, ...normalized.slice(1));
  }
  return path.join(ADAPTER_ROOT, dir, ...normalized);
}

export function platformAdapterPath(id, ...segments) {
  return path.join(ADAPTER_ROOT, platformDir(id), ...segments);
}

export { ADAPTER_ROOT, BACKEND_ROOT };
