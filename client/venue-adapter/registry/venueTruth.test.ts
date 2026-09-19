import type { PlatformAdapter } from "../contract";
import type { PlatformMeta } from "./meta";
import { describe, expect, it } from "vitest";
import { buildCollectorFactories, getAdapter, PLATFORM_ADAPTERS } from "./adapters";
import {
  ALL_PLATFORMS,
  browserSaveMatchPlatformIds,
  collectPlatformIds,
  isVpsOwnedPlatformCollect,
  PLATFORM_REGISTRY,
} from "./meta";
import {
  assertCollectorRuntimeRespectsActivation,
  validateVenueTruth,
} from "./venueTruth";

function meta(partial: Partial<PlatformMeta> & Pick<PlatformMeta, "id">): PlatformMeta {
  return {
    dir: partial.dir ?? partial.id.toLowerCase(),
    sort: partial.sort ?? 0,
    collect: partial.collect ?? false,
    bet: partial.bet ?? false,
    collectionMode: partial.collectionMode ?? "http_ws",
    ...partial,
  };
}

function adapter(partial: PlatformAdapter): PlatformAdapter {
  return partial;
}

const noopCollector = () => () => {};
const stubProvider = {
  checkBet: async () => ({}) as never,
  betting: async () => ({}) as never,
};

describe("validateVenueTruth ontology", () => {
  it("case 1: SABA collector exists + collect=false => PASS", () => {
    const saba = getAdapter("SABA");
    expect(saba?.collector).toBeTypeOf("function");
    expect(PLATFORM_REGISTRY.find(p => p.id === "SABA")?.collect).toBe(false);
    const report = validateVenueTruth({
      catalog: PLATFORM_REGISTRY,
      adapters: PLATFORM_ADAPTERS,
    });
    expect(report.errors.filter(e => e.id === "SABA")).toEqual([]);
    expect(report.notes.some(n => n.includes("SABA") && n.includes("collect=false"))).toBe(true);
  });

  it("case 2: IMT collector exists + collect=false => PASS", () => {
    expect(getAdapter("IMT")?.collector).toBeTypeOf("function");
    expect(PLATFORM_REGISTRY.find(p => p.id === "IMT")?.collect).toBe(false);
    const report = validateVenueTruth({
      catalog: PLATFORM_REGISTRY,
      adapters: PLATFORM_ADAPTERS,
    });
    expect(report.errors.filter(e => e.id === "IMT")).toEqual([]);
  });

  it("case 3: Dex provider exists + bet=false => PASS", () => {
    expect(getAdapter("Dex")?.provider).toBeTruthy();
    expect(PLATFORM_REGISTRY.find(p => p.id === "Dex")?.bet).toBe(false);
    const report = validateVenueTruth({
      catalog: PLATFORM_REGISTRY,
      adapters: PLATFORM_ADAPTERS,
    });
    expect(report.errors.filter(e => e.id === "Dex")).toEqual([]);
    expect(report.notes.some(n => n.includes("Dex") && n.includes("bet=false"))).toBe(true);
  });

  it("case 4: OB collector exists + collect=true => PASS", () => {
    expect(getAdapter("OB")?.collector).toBeTypeOf("function");
    expect(PLATFORM_REGISTRY.find(p => p.id === "OB")?.collect).toBe(true);
    const report = validateVenueTruth({
      catalog: PLATFORM_REGISTRY,
      adapters: PLATFORM_ADAPTERS,
    });
    expect(report.ok).toBe(true);
    expect(report.errors).toEqual([]);
  });

  it("case 5: collect=true + collector missing => FAIL", () => {
    const report = validateVenueTruth({
      catalog: [meta({ id: "OB", collect: true, bet: false })],
      adapters: [adapter({ id: "OB" })],
    });
    expect(report.ok).toBe(false);
    expect(report.errors.some(e => e.code === "invalid_collect_activation")).toBe(true);
  });

  it("case 6: bet=true + provider missing => FAIL", () => {
    const report = validateVenueTruth({
      catalog: [meta({ id: "OB", collect: false, bet: true })],
      adapters: [adapter({ id: "OB", collector: noopCollector })],
    });
    expect(report.ok).toBe(false);
    expect(report.errors.some(e => e.code === "invalid_bet_activation")).toBe(true);
  });

  it("case 7: Polymarket hybrid collect=true + vps_http_ws + collector => PASS", () => {
    const pm = PLATFORM_REGISTRY.find(p => p.id === "Polymarket")!;
    expect(pm.collect).toBe(true);
    expect(pm.collectionMode).toBe("vps_http_ws");
    expect(getAdapter("Polymarket")?.collector).toBeTypeOf("function");
    expect(isVpsOwnedPlatformCollect("Polymarket")).toBe(true);
    expect(browserSaveMatchPlatformIds()).not.toContain("Polymarket");
    const report = validateVenueTruth({
      catalog: PLATFORM_REGISTRY,
      adapters: PLATFORM_ADAPTERS,
    });
    expect(report.errors.filter(e => e.id === "Polymarket")).toEqual([]);
  });

  it("case 8: PredictFun product activation OK even if deploy may pause VPS", () => {
    const pf = PLATFORM_REGISTRY.find(p => p.id === "PredictFun")!;
    expect(pf.collect).toBe(true);
    expect(pf.collectionMode).toBe("vps_http_ws");
    // Manifest validation must not encode Deployment Activation
    const report = validateVenueTruth({
      catalog: PLATFORM_REGISTRY,
      adapters: PLATFORM_ADAPTERS,
    });
    expect(report.ok).toBe(true);
    expect(report.errors.filter(e => e.id === "PredictFun")).toEqual([]);
    expect(isVpsOwnedPlatformCollect("PredictFun")).toBe(true);
    expect(browserSaveMatchPlatformIds()).not.toContain("PredictFun");
  });

  it("inactive implementation fixtures: collect=false+collector and bet=false+provider ALLOWED", () => {
    const report = validateVenueTruth({
      catalog: [
        meta({ id: "SABA", collect: false, bet: true }),
        meta({ id: "Dex", collect: false, bet: false }),
      ],
      adapters: [
        adapter({ id: "SABA", collector: noopCollector, provider: stubProvider }),
        adapter({ id: "Dex", collector: noopCollector, provider: stubProvider }),
      ],
    });
    expect(report.ok).toBe(true);
    expect(report.errors).toEqual([]);
  });
});

describe("live registry integrity", () => {
  it("full catalog+adapters satisfy venue truth", () => {
    const report = validateVenueTruth({
      catalog: PLATFORM_REGISTRY,
      adapters: PLATFORM_ADAPTERS,
    });
    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("buildCollectorFactories never bypasses manifest.collect activation", () => {
    const factories = buildCollectorFactories();
    const collectIds = collectPlatformIds();
    expect(assertCollectorRuntimeRespectsActivation(collectIds, factories)).toEqual([]);
    for (const id of Object.keys(factories))
      expect(collectIds).toContain(id);
    // Inactive implementations must not appear in runtime map
    expect(factories.SABA).toBeUndefined();
    expect(factories.IMT).toBeUndefined();
    expect(factories.Dex).toBeUndefined();
    expect(factories.Azuro).toBeUndefined();
  });

  it("derived catalog ALL_PLATFORMS view includes paused venues", () => {
    expect(ALL_PLATFORMS).toEqual(PLATFORM_REGISTRY.map(p => p.id));
    expect(ALL_PLATFORMS).toContain("IM");
    expect(ALL_PLATFORMS).toContain("PredictFun");
  });

  it("vps-owned venues are never browser Save venues", () => {
    for (const id of ALL_PLATFORMS) {
      if (isVpsOwnedPlatformCollect(id))
        expect(browserSaveMatchPlatformIds()).not.toContain(id);
    }
  });
});
