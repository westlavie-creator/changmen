"use strict";

const {
  MANIFEST,
  normalizePlatformId,
  getManifestEntry,
  resolveBackendFeedModule,
} = require("./paths.js");

/** ObFeed 构造参数；`OB_FEED_MODE=a8` 时对齐 UMe（单源 index + 1500ms stage） */
function buildObFeedOptions() {
  const { A8_INDEX_SOURCES } = require(resolveBackendFeedModule("OB"));
  const base = { indexIntervalMs: 30000 };
  const mode = String(process.env.OB_FEED_MODE || "").trim().toLowerCase();
  if (mode === "a8") {
    return {
      ...base,
      feedMode: "a8",
      indexSources: A8_INDEX_SOURCES,
      stageDelayMs: 1500,
    };
  }
  return base;
}

function applyFeedOptionsEnv(meta) {
  const options = { ...(meta.feedOptions || {}) };
  const envMap = meta.feedOptionsEnv || {};
  for (const [envKey, optionKey] of Object.entries(envMap)) {
    const raw = process.env[envKey];
    if (raw === undefined || raw === "") continue;
    const num = Number(raw);
    options[optionKey] = Number.isFinite(num) ? num : raw;
  }
  if (meta.id === "OB") {
    return { ...options, ...buildObFeedOptions() };
  }
  return options;
}

function isPlatformEnabled(meta) {
  const env = process.env[meta.envEnable];
  if (env === "0") return false;
  if (env === "1") return true;
  return Boolean(meta.defaultEnabled);
}

function loadFeedClass(meta) {
  const abs = resolveBackendFeedModule(meta.id);
  const mod = require(abs);
  const exportName = meta.backendFeed.export;
  const Feed = mod[exportName];
  if (!Feed) throw new Error(`Feed export missing: ${meta.id} ${exportName} (${abs})`);
  return Feed;
}

function buildFeedHubEntries() {
  return MANIFEST.map((meta) => {
    const Feed = loadFeedClass(meta);
    const options = applyFeedOptionsEnv(meta);
    return {
      id: meta.id,
      label: meta.label,
      Feed,
      options,
      enabled: isPlatformEnabled(meta),
    };
  });
}

function listPlatforms() {
  return MANIFEST.map((p) => ({
    id: p.id,
    dir: p.dir,
    label: p.label,
    labelZh: p.labelZh,
    collectionMode: p.collectionMode,
    collectionDesc: p.collectionDesc,
    implementation: p.implementation,
    envEnable: p.envEnable,
    defaultEnabled: p.defaultEnabled,
    enabled: isPlatformEnabled(p),
    streamMeta: p.streamMeta,
    pagePath: p.pagePath,
    collect: p.collect,
    bet: p.bet,
  }));
}

function getPlatform(id) {
  return getManifestEntry(id);
}

/** @deprecated 使用 platform_adapter/registry/manifest.json */
const PLATFORMS = MANIFEST;

module.exports = {
  PLATFORMS,
  MANIFEST,
  listPlatforms,
  getPlatform,
  normalizePlatformId,
  isPlatformEnabled,
  buildFeedHubEntries,
  resolveBackendFeedModule,
};
