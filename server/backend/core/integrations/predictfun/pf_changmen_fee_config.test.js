import { beforeEach, describe, expect, it, vi } from "vitest";

const mem = new Map();

vi.mock("@changmen/storage/json_file_store.js", () => ({
  readJsonFile: (name, fallback) => (mem.has(name) ? mem.get(name) : fallback),
  writeJsonFile: (name, data) => {
    mem.set(name, data);
  },
}));

describe("pf_changmen_fee_config", () => {
  beforeEach(() => {
    mem.clear();
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("falls back to env when no file", async () => {
    vi.stubEnv("PF_CHANGMEN_BUY_FEE_RATE_BPS", "50");
    vi.stubEnv("PF_CHANGMEN_SELL_FEE_RATE_BPS", "150");
    const mod = await import("./pf_changmen_fee_config.js");
    expect(mod.resolvePfChangmenBuyFeeRateBps()).toBe(50);
    expect(mod.resolvePfChangmenSellFeeRateBps()).toBe(150);
    expect(mod.resolvePfChangmenFeeRateBps()).toBe(150);
  });

  it("save then read buy/sell bps", async () => {
    const mod = await import("./pf_changmen_fee_config.js");
    const saved = mod.savePfChangmenFeeConfig({
      buyFeeRatePercent: 1.5,
      sellFeeRatePercent: 2,
    });
    expect(saved.buyFeeRateBps).toBe(150);
    expect(saved.sellFeeRateBps).toBe(200);
    expect(mod.getPfChangmenFeeConfig().buyFeeRateBps).toBe(150);
    expect(mod.getPfChangmenFeeConfig().sellFeeRateBps).toBe(200);
  });

  it("file overrides env", async () => {
    vi.stubEnv("PF_CHANGMEN_BUY_FEE_RATE_BPS", "10");
    vi.stubEnv("PF_CHANGMEN_SELL_FEE_RATE_BPS", "20");
    const mod = await import("./pf_changmen_fee_config.js");
    mod.savePfChangmenFeeConfig({ buyFeeRateBps: 300, sellFeeRateBps: 400 });
    expect(mod.resolvePfChangmenBuyFeeRateBps()).toBe(300);
    expect(mod.resolvePfChangmenSellFeeRateBps()).toBe(400);
  });
});
