"use strict";

const fs = require("fs");
const path = require("path");

const REGISTRY_ROOT = __dirname;
const ADAPTER_ROOT = path.join(REGISTRY_ROOT, "..");

function resolveBackendRoot() {
  const inside = path.join(ADAPTER_ROOT, "..");
  if (
    fs.existsSync(path.join(inside, "package.json")) &&
    fs.existsSync(path.join(inside, "core"))
  ) {
    return inside;
  }
  return path.join(ADAPTER_ROOT, "..", "gamebet_backend");
}

const BACKEND_ROOT = resolveBackendRoot();
const RELAYS_LEGACY = path.join(BACKEND_ROOT, "relays");

/** @typedef {import("./manifest.json")[number]} PlatformManifestEntry */

/** @type {PlatformManifestEntry[]} */
const MANIFEST = require("./manifest.json");

function normalizePlatformId(id) {
  const key = String(id || "").trim();
  if (key.toUpperCase() === "XBET") return "XBet";
  const hit = MANIFEST.find((p) => p.id.toUpperCase() === key.toUpperCase());
  return hit ? hit.id : key;
}

function getManifestEntry(id) {
  const normalized = normalizePlatformId(id);
  return MANIFEST.find((p) => p.id === normalized) || null;
}

function platformDir(id) {
  return getManifestEntry(id)?.dir || String(id || "").toLowerCase();
}

/**
 * 新路径：platform_adapter/{dir}/backend/{name}
 * 旧路径：gamebet_backend/platforms/{dir}/{name}
 */
function resolvePlatformFile(id, ...segments) {
  const dir = platformDir(id);
  const future = path.join(ADAPTER_ROOT, dir, ...segments);
  if (fs.existsSync(future)) return future;
  const legacy = path.join(BACKEND_ROOT, "platforms", dir, ...segments);
  if (fs.existsSync(legacy)) return legacy;
  return future;
}

function resolveBackendFeedModule(id) {
  const entry = getManifestEntry(id);
  if (!entry?.backendFeed) {
    throw new Error(`manifest missing backendFeed: ${id}`);
  }
  const future = path.join(ADAPTER_ROOT, entry.dir, "backend", "feed.js");
  if (fs.existsSync(future)) return future;
  return path.join(BACKEND_ROOT, "platforms", entry.dir, entry.backendFeed.file);
}

function resolveBackendRelayModule(id) {
  const entry = getManifestEntry(id);
  if (!entry?.backendRelay) return null;
  const future = path.join(ADAPTER_ROOT, entry.dir, "backend", "relay.js");
  if (fs.existsSync(future)) return future;
  return path.join(RELAYS_LEGACY, entry.backendRelay);
}

function platformAdapterPath(id, ...segments) {
  return path.join(ADAPTER_ROOT, platformDir(id), ...segments);
}

module.exports = {
  ADAPTER_ROOT,
  BACKEND_ROOT,
  MANIFEST,
  normalizePlatformId,
  getManifestEntry,
  platformDir,
  resolvePlatformFile,
  resolveBackendFeedModule,
  resolveBackendRelayModule,
  platformAdapterPath,
};
