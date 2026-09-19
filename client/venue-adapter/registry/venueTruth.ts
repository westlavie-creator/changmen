/**
 * Venue Source-of-Truth validation (Phase 3 contract).
 *
 * Ontology:
 * - adapter.collector / adapter.provider = Implementation exists (CODE)
 * - manifest.collect / manifest.bet = Product Activation (CONFIG)
 * - Implementation without Activation is ALLOWED
 * - Activation without Implementation is INVALID
 *
 * @see docs/architecture/VENUE_ARCHITECTURE_AUDIT.md §29–§36
 */
import type { PlatformId } from "@changmen/api-contract";
import type { PlatformAdapter } from "../contract";
import type { PlatformMeta } from "./meta";

export interface VenueTruthIssue {
  code:
    | "duplicate_manifest_id"
    | "duplicate_manifest_dir"
    | "adapter_missing_from_catalog"
    | "invalid_collect_activation"
    | "invalid_bet_activation"
    | "catalog_without_adapter";
  message: string;
  id?: string;
}

export interface VenueTruthReport {
  ok: boolean;
  errors: VenueTruthIssue[];
  /** Informational only — never fails validation */
  notes: string[];
}

/**
 * Validate Catalog ↔ Adapter activation ontology.
 * Does NOT inspect deploy/PM2 (Deployment Activation is a separate layer).
 */
export function validateVenueTruth(opts: {
  catalog: PlatformMeta[];
  adapters: PlatformAdapter[];
}): VenueTruthReport {
  const errors: VenueTruthIssue[] = [];
  const notes: string[] = [];
  const { catalog, adapters } = opts;

  const ids = catalog.map(e => e.id);
  const dirs = catalog.map(e => e.dir);
  const seenIds = new Set<string>();
  for (const id of ids) {
    if (seenIds.has(id)) {
      errors.push({
        code: "duplicate_manifest_id",
        message: `manifest contains duplicate id "${id}"`,
        id,
      });
    }
    seenIds.add(id);
  }
  const seenDirs = new Set<string>();
  for (const dir of dirs) {
    if (seenDirs.has(dir)) {
      errors.push({
        code: "duplicate_manifest_dir",
        message: `manifest contains duplicate dir "${dir}"`,
        id: dir,
      });
    }
    seenDirs.add(dir);
  }

  const adapterById = new Map(adapters.map(a => [a.id, a]));
  const catalogById = new Map(catalog.map(e => [e.id, e]));

  for (const adapter of adapters) {
    if (!catalogById.has(adapter.id)) {
      errors.push({
        code: "adapter_missing_from_catalog",
        message: `adapter "${adapter.id}" is not in manifest Catalog`,
        id: adapter.id,
      });
    }
  }

  for (const entry of catalog) {
    const adapter = adapterById.get(entry.id);
    if (!adapter) {
      // Paused / stub venues may still need a Catalog row; require an adapter shell in adapters.ts.
      errors.push({
        code: "catalog_without_adapter",
        message: `manifest Catalog id "${entry.id}" has no PlatformAdapter registration`,
        id: entry.id,
      });
      continue;
    }

    if (entry.collect && !adapter.collector) {
      errors.push({
        code: "invalid_collect_activation",
        message:
          `INVALID ACTIVATION: manifest.collect=true for "${entry.id}" but adapter.collector is missing`,
        id: entry.id,
      });
    }
    // collect=false + collector exists → ALLOWED (Implementation ≠ Activation)
    if (!entry.collect && adapter.collector) {
      notes.push(
        `ALLOWED inactive implementation: "${entry.id}" has collector but manifest.collect=false`,
      );
    }

    if (entry.bet && !adapter.provider) {
      errors.push({
        code: "invalid_bet_activation",
        message:
          `INVALID ACTIVATION: manifest.bet=true for "${entry.id}" but adapter.provider is missing`,
        id: entry.id,
      });
    }
    if (!entry.bet && adapter.provider) {
      notes.push(
        `ALLOWED inactive implementation: "${entry.id}" has provider but manifest.bet=false`,
      );
    }
  }

  return { ok: errors.length === 0, errors, notes };
}

/** Runtime: collectors only start for Product Activation ∩ Implementation */
export function assertCollectorRuntimeRespectsActivation(
  collectIds: PlatformId[],
  factories: Partial<Record<PlatformId, unknown>>,
): VenueTruthIssue[] {
  const errors: VenueTruthIssue[] = [];
  for (const id of Object.keys(factories) as PlatformId[]) {
    if (!collectIds.includes(id)) {
      errors.push({
        code: "invalid_collect_activation",
        message:
          `Runtime bypass: collector factory registered for "${id}" but id is not in collectPlatformIds()`,
        id,
      });
    }
  }
  return errors;
}
