import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultUserConfig, type UserConfig } from "@/types/userConfig";

const config: UserConfig = createDefaultUserConfig();
const processLoseOrders = vi.fn(async () => {});

vi.mock("@/stores/configStore", () => ({
  useConfigStore: () => ({ config }),
}));

vi.mock("@/stores/matchStore", () => ({
  useMatchStore: () => ({ matchs: [] }),
}));

vi.mock("@/stores/loseOrderStore", () => ({
  useLoseOrderStore: () => ({ orders: { size: 0 } }),
}));

vi.mock("@/stores/betting/autoBet/executeArbBet", () => ({
  executeArbBet: vi.fn(async () => {}),
}));

import { runAutoBetTick } from "./autoBetLoop";

describe("runAutoBetTick random betMoney", () => {
  beforeEach(() => {
    Object.assign(config, createDefaultUserConfig());
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });

  it("does not randomize when minMoney is 0 (A8 minMoney!==0 gate)", async () => {
    config.betMoney = 999;
    config.minMoney = 0;
    config.maxMoney = 100;

    await runAutoBetTick({ setMessage: () => {}, processLoseOrders });

    expect(config.betMoney).toBe(999);
  });

  it("skips randomize when maxMoney is 0", async () => {
    config.betMoney = 999;
    config.minMoney = 0;
    config.maxMoney = 0;

    await runAutoBetTick({ setMessage: () => {}, processLoseOrders });

    expect(config.betMoney).toBe(999);
  });

  it("randomizes when both min and max are non-zero", async () => {
    config.betMoney = 999;
    config.minMoney = 10;
    config.maxMoney = 110;

    await runAutoBetTick({ setMessage: () => {}, processLoseOrders });

    expect(config.betMoney).toBe(60);
  });
});
