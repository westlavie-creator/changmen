"use strict";

const { MANIFEST, normalizePlatformId, getManifestEntry } = require("./paths.js");

function listPlatforms() {
  return MANIFEST.map((p) => ({
    id: p.id,
    dir: p.dir,
    label: p.label,
    labelZh: p.labelZh,
    collectionMode: p.collectionMode,
    collectionDesc: p.collectionDesc,
    implementation: p.implementation,
    streamMeta: p.streamMeta,
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
};
