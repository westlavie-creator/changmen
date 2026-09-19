import type { PlatformId } from "@changmen/api-contract";
import manifest from "./manifest.json";

/**
 * Typed view of PRIMARY Venue Catalog + Product Activation + UI/Policy fields.
 * SoT: `manifest.json` — see docs/architecture/VENUE_ARCHITECTURE_AUDIT.md §29.
 *
 * - `collect` / `bet` = Product Activation (not Implementation)
 * - `collectionMode` = Runtime ownership/topology (`vps_http_ws` ⇒ VPS owns platform_*)
 * - Derived views: ALL_PLATFORMS, collectPlatformIds, betPlatformIds, browserSave*, isVpsOwned*
 */
export interface PlatformMeta {
  id: PlatformId;
  dir: string;
  sort: number;
  /** Product Activation: register browser collector factory when true */
  collect: boolean;
  /** Product Activation: allow getProvider betting path when true */
  bet: boolean;
  /**
   * LEGACY / RETIRE CANDIDATE — no runtime consumers.
   * Do not treat as “plugin-only capability”; PM/PF are Hybrid + pluginOnly historically.
   */
  pluginOnly?: boolean;
  /** LEGACY annotation — no runtime consumers */
  a8Channel?: boolean;
  /**
   * Runtime Collection Ownership / Topology.
   * Hard gate: `vps_http_ws` ⇒ Browser Save* forbidden (isVpsOwnedPlatformCollect).
   * Other mode strings are mostly transport/UI hints (no code branches).
   */
  collectionMode: string;
  /**
   * LEGACY / DEAD FIELD — not read by collectors (intervals live in collect.ts).
   * Do not use as Collection Policy authority.
   */
  saveMatchIntervalMs?: number;
  /** 角标文件名，位于 client/web/public/assets/venue/ */
  icon?: string;
}

const entries = manifest as PlatformMeta[];

export const PLATFORM_REGISTRY: PlatformMeta[] = entries.slice().sort((a, b) => a.sort - b.sort);

/** Derived view of Catalog ids (incl. paused) — NOT a second Source of Truth */
export const ALL_PLATFORMS: PlatformId[] = PLATFORM_REGISTRY.map(p => p.id);

const metaById = new Map(PLATFORM_REGISTRY.map(p => [p.id, p]));
const metaByIdUpper = new Map(PLATFORM_REGISTRY.map(p => [p.id.toUpperCase(), p]));

export function getPlatformMeta(id: PlatformId | string): PlatformMeta | undefined {
  const key = String(id || "").trim();
  if (!key)
    return undefined;
  return metaById.get(key as PlatformId) ?? metaByIdUpper.get(key.toUpperCase());
}

export function platformSupportsCollect(id: PlatformId): boolean {
  return getPlatformMeta(id)?.collect ?? false;
}

export function platformSupportsBet(id: PlatformId): boolean {
  return getPlatformMeta(id)?.bet ?? false;
}

/** Product Activation: venues with manifest.collect === true */
export function collectPlatformIds(): PlatformId[] {
  return PLATFORM_REGISTRY.filter(p => p.collect).map(p => p.id);
}

/**
 * Derived: Browser Save* UI allowlist = Product collect ∧ ¬VPS ownership.
 * VPS-owned venues still may run browser collectors for fo/quote (Hybrid).
 */
export function browserSaveMatchPlatformIds(): PlatformId[] {
  return PLATFORM_REGISTRY
    .filter(p => p.collect && p.collectionMode !== "vps_http_ws")
    .map(p => p.id);
}

/**
 * Runtime Policy gate: VPS collector owns platform_* writes
 * (manifest `collectionMode: vps_http_ws`).
 * Browser must not SaveMatch/SaveBet/SaveLiveTimer; new venues only change manifest.
 */
export function isVpsOwnedPlatformCollect(id: PlatformId | string): boolean {
  return getPlatformMeta(id)?.collectionMode === "vps_http_ws";
}

/** Product Activation: venues with manifest.bet === true */
export function betPlatformIds(): PlatformId[] {
  return PLATFORM_REGISTRY.filter(p => p.bet).map(p => p.id);
}

export function platformDir(id: PlatformId): string | undefined {
  return metaById.get(id)?.dir;
}
