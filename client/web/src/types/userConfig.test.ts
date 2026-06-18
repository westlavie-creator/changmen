import { describe, expect, it } from "vitest";
import {
  ALL_PLATFORMS,
  createDefaultUserConfig,
  mergeProviderSortValue,
  mergeUserConfig,
  type UserConfig,
} from "@/types/userConfig";

describe("mergeProviderSortValue", () => {
  it("appends missing platforms without reordering existing entries", () => {
    const [first, second] = ALL_PLATFORMS;
    const merged = mergeProviderSortValue([second, first]);
    expect(merged.slice(0, 2)).toEqual([second, first]);
    expect(merged).toEqual(expect.arrayContaining(ALL_PLATFORMS));
    expect(new Set(merged).size).toBe(ALL_PLATFORMS.length);
  });

  it("is applied when loading USERCONFIG via mergeUserConfig", () => {
    const [only] = ALL_PLATFORMS;
    const cfg = mergeUserConfig({ providerSortValue: [only] });
    expect(cfg.providerSortValue[0]).toBe(only);
    expect(cfg.providerSortValue).toEqual(expect.arrayContaining(ALL_PLATFORMS));
  });
});

describe("mergeUserConfig arbDetectEngine", () => {
  it("defaults to a8", () => {
    expect(mergeUserConfig(null).arbDetectEngine).toBe("a8");
    expect(mergeUserConfig(undefined).arbDetectEngine).toBe("a8");
    expect(createDefaultUserConfig().arbDetectEngine).toBe("a8");
  });

  it("reads legacy arbExecuteEngine when arbDetectEngine is absent", () => {
    expect(mergeUserConfig({ arbExecuteEngine: "kakaxi" }).arbDetectEngine).toBe("kakaxi");
    expect(mergeUserConfig({ arbExecuteEngine: "a8" }).arbDetectEngine).toBe("a8");
  });

  it("prefers arbDetectEngine over legacy arbExecuteEngine", () => {
    expect(
      mergeUserConfig({ arbDetectEngine: "a8", arbExecuteEngine: "kakaxi" }).arbDetectEngine,
    ).toBe("a8");
  });

  it("maps legacy changmen alias to kakaxi", () => {
    expect(
      mergeUserConfig({ arbExecuteEngine: "changmen" } as unknown as Partial<UserConfig>).arbDetectEngine,
    ).toBe("kakaxi");
  });

  it("does not persist arbExecuteEngine on merged config", () => {
    expect(mergeUserConfig({ arbExecuteEngine: "kakaxi" })).not.toHaveProperty("arbExecuteEngine");
    expect(mergeUserConfig({ arbDetectEngine: "kakaxi" })).not.toHaveProperty("arbExecuteEngine");
  });
});
