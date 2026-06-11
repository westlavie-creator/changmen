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

/** platform_adapter/{dir}/... */
function resolvePlatformFile(id, ...segments) {
  const dir = platformDir(id);
  return path.join(ADAPTER_ROOT, dir, ...segments);
}

function resolveBackendRelayModule(id) {
  const entry = getManifestEntry(id);
  if (!entry?.backendRelay) return null;
  return path.join(ADAPTER_ROOT, entry.dir, "backend", "relay.js");
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
  resolveBackendRelayModule,
  platformAdapterPath,
};
