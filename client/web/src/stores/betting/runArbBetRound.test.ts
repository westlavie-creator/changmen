import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultUserConfig } from "@/types/userConfig";

const config = createDefaultUserConfig();
const processLoseOrders = vi.fn(async () => {});

vi.mock("@/stores/configStore", () => ({
  useConfigStore: () => ({ config }),
}));

vi.mock("@/stores/matchStore", () => ({
  useMatchStore: () => ({ matchs: [] }),
}));

vi.mock("@/stores/loseOrderStore", () => ({
  useLoseOrderStore: () => ({ orders: { size: 2 } }),
}));

vi.mock("@/stores/betting/autoBet/executeArbBet", () => ({
  executeArbBet: vi.fn(async () => {}),
}));

import { runArbBetRound } from "@/stores/betting/runArbBetRound";

describe("runArbBetRound lose-order gate", () => {
  beforeEach(() => {
    Object.assign(config, createDefaultUserConfig());
    processLoseOrders.mockClear();
  });

  it("processes lose orders when makeUp on even if betting off (A8 jb)", async () => {
    config.makeUp = true;
    config.betting = false;

    await runArbBetRound({ setMessage: () => {}, processLoseOrders });

    expect(processLoseOrders).toHaveBeenCalledOnce();
  });

  it("skips lose orders when makeUp off", async () => {
    config.makeUp = false;
    config.betting = true;

    await runArbBetRound({ setMessage: () => {}, processLoseOrders });

    expect(processLoseOrders).not.toHaveBeenCalled();
  });
});
