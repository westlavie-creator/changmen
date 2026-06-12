import {
  MANIFEST,
  normalizePlatformId,
  getManifestEntry,
} from "./paths.js";

export function listPlatforms() {
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

export function getPlatform(id) {
  return getManifestEntry(id);
}

/** @deprecated 使用 platform_adapter/registry/manifest.json */
export const PLATFORMS = MANIFEST;

export { MANIFEST, normalizePlatformId };
