#!/usr/bin/env node
/**
 * Venue Catalog consistency (no package cycles).
 *
 * PRIMARY SOURCE: client/venue-adapter/registry/manifest.json
 * TYPE MIRROR: packages/api-contract PlatformId / zod enum
 * BOUNDARY PROJECTION: client/venue-adapter/shared/platforms.ts
 * LEGACY COPY: packages/client-core/src/types/platforms.ts ALL_PLATFORMS
 *
 * Usage: node scripts/check-venue-catalog-consistency.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fail(msg) {
  console.error(`[check-venue-catalog] ERROR: ${msg}`);
  process.exitCode = 1;
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function loadManifestIds() {
  const manifest = JSON.parse(read("client/venue-adapter/registry/manifest.json"));
  if (!Array.isArray(manifest))
    throw new Error("manifest.json must be an array");
  const ids = [];
  const dirs = [];
  for (const entry of manifest) {
    if (!entry?.id)
      fail("manifest entry missing id");
    ids.push(String(entry.id));
    dirs.push(String(entry.dir || ""));
  }
  const idSet = new Set();
  for (const id of ids) {
    if (idSet.has(id))
      fail(`manifest contains duplicate id "${id}"`);
    idSet.add(id);
  }
  const dirSet = new Set();
  for (const dir of dirs) {
    if (!dir)
      continue;
    if (dirSet.has(dir))
      fail(`manifest contains duplicate dir "${dir}"`);
    dirSet.add(dir);
  }
  return ids;
}

function parseQuotedIdsFromEnumUnion(src) {
  // PlatformId = | "OB" | "RAY" ...
  return [...src.matchAll(/"([^"]+)"/g)].map(m => m[1]);
}

function parseZodEnumIds(src) {
  const m = src.match(/z\.enum\(\[([^\]]+)\]\)/);
  if (!m)
    throw new Error("could not find z.enum([...]) for PlatformId in schemas.ts");
  return [...m[1].matchAll(/"([^"]+)"/g)].map(x => x[1]);
}

function parseSharedPlatformsIds(src) {
  return [...src.matchAll(/^\s*(\w+)\s*:\s*"([^"]+)"/gm)].map(([, key, val]) => {
    if (key !== val)
      fail(`shared/platforms.ts key/value mismatch: ${key}: "${val}"`);
    return val;
  });
}

function parseClientCoreAllPlatforms(src) {
  const m = src.match(/export const ALL_PLATFORMS[^=]*=\s*\[([^\]]+)\]/);
  if (!m)
    throw new Error("could not parse client-core ALL_PLATFORMS array");
  return [...m[1].matchAll(/"([^"]+)"/g)].map(x => x[1]);
}

function diffSets(labelA, a, labelB, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  const missingInB = a.filter(x => !setB.has(x));
  const extraInB = b.filter(x => !setA.has(x));
  if (missingInB.length) {
    fail(
      `${labelA} contains [${missingInB.join(", ")}] but ${labelB} does not — `
      + `fix ${labelB} to match Catalog (manifest), or remove stale ids from ${labelA}`,
    );
  }
  if (extraInB.length) {
    fail(
      `${labelB} contains [${extraInB.join(", ")}] but ${labelA} does not — `
      + `add missing Catalog rows to manifest, or remove unknown ids from ${labelB}`,
    );
  }
}

function main() {
  const catalogIds = loadManifestIds();
  console.warn(`[check-venue-catalog] Catalog (manifest) ids: ${catalogIds.length}`);

  const dtoSrc = read("packages/api-contract/src/dto.ts");
  const dtoIds = parseQuotedIdsFromEnumUnion(
    dtoSrc.slice(dtoSrc.indexOf("export type PlatformId"), dtoSrc.indexOf("export interface LoginInfo")),
  );
  diffSets("manifest", catalogIds, "api-contract PlatformId (dto.ts)", dtoIds);

  const schemaIds = parseZodEnumIds(read("packages/api-contract/src/schemas.ts"));
  diffSets("manifest", catalogIds, "api-contract zod PlatformId (schemas.ts)", schemaIds);

  // schemas.js may be a build artifact — check if present
  const schemasJs = path.join(ROOT, "packages/api-contract/src/schemas.js");
  if (fs.existsSync(schemasJs)) {
    const jsIds = parseZodEnumIds(fs.readFileSync(schemasJs, "utf8"));
    diffSets("manifest", catalogIds, "api-contract zod PlatformId (schemas.js)", jsIds);
  }

  const sharedIds = parseSharedPlatformsIds(read("client/venue-adapter/shared/platforms.ts"));
  diffSets("manifest", catalogIds, "shared/platforms.ts (Boundary Projection)", sharedIds);

  const coreIds = parseClientCoreAllPlatforms(read("packages/client-core/src/types/platforms.ts"));
  // Order should follow manifest sort (Catalog order)
  diffSets("manifest", catalogIds, "client-core ALL_PLATFORMS (Legacy Copy)", coreIds);
  if (coreIds.join(",") !== catalogIds.join(",")) {
    fail(
      "client-core ALL_PLATFORMS order differs from manifest sort order — "
      + "align with Catalog (manifest.json) order for account sort parity",
    );
  }

  // Chrome FEATURE projection: Venue-like ids (exclude documented probe-only HGA) ⊆ Catalog
  const chromeSrc = read("chrome-extension/src/content/platforms.js");
  const chromeIds = [...chromeSrc.matchAll(/^\s*(\w+)\s*:\s*"([^"]+)"/gm)].map(([, , val]) => val);
  const chromeProbeOnly = new Set(["HGA"]); // A8 probe id — not a Changmen Catalog venue
  for (const id of chromeIds) {
    if (chromeProbeOnly.has(id))
      continue;
    if (!catalogIds.includes(id)) {
      fail(
        `chrome-extension platforms.js Venue id "${id}" is not in manifest Catalog — `
        + `add Catalog row, or document as probe-only like HGA`,
      );
    }
  }

  if (process.exitCode) {
    console.error("[check-venue-catalog] FAILED");
    process.exit(process.exitCode);
  }
  console.warn("[check-venue-catalog] OK — manifest ≡ PlatformId ≡ shared/platforms ≡ client-core ALL_PLATFORMS");
  console.warn(`[check-venue-catalog] chrome Venue ids ⊆ Catalog (probe-only exempt: ${[...chromeProbeOnly].join(", ")})`);
}

main();
