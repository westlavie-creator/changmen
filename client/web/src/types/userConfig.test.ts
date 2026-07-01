import type { UserConfig } from "@/types/userConfig";
import { describe, expect, it } from "vitest";
import {
  ALL_PLATFORMS,
  mergeProviderSortValue,
  mergeUserConfig,

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

describe("mergeUserConfig legacy fields", () => {
  it("strips deprecated arbDetectEngine and arbExecuteEngine", () => {
    const cfg = mergeUserConfig({
      arbDetectEngine: "kakaxi",
      arbExecuteEngine: "a8",
    } as unknown as Partial<UserConfig>);
    expect(cfg).not.toHaveProperty("arbDetectEngine");
    expect(cfg).not.toHaveProperty("arbExecuteEngine");
    expect(cfg.betting).toBe(false);
  });
});
