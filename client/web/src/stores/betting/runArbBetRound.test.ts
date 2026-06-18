import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultUserConfig } from "@/types/userConfig";

const config = createDefaultUserConfig();
const processLoseOrders = vi.fn(async () => {});
const matchStoreState = {
  matchs: [] as { id: number; bets: { id: number }[] }[],
};

const runA8ArbRound = vi.fn(async () => {});
const runKakaxiArbRound = vi.fn(async () => {});

vi.mock("@/stores/configStore", () => ({
  useConfigStore: () => ({ config }),
}));

vi.mock("@/stores/matchStore", () => ({
  useMatchStore: () => matchStoreState,
}));

vi.mock("@/stores/loseOrderStore", () => ({
  useLoseOrderStore: () => ({ orders: { size: 2 } }),
}));

vi.mock("@/stores/betting/a8/runA8ArbRound", () => ({
  runA8ArbRound: () => runA8ArbRound(),
}));

vi.mock("@/stores/betting/kakaxi/runKakaxiArbRound", () => ({
  runKakaxiArbRound: () => runKakaxiArbRound(),
}));

vi.mock("@/stores/betting/autoBet/executeArbBet", () => ({
  executeArbBet: vi.fn(async () => {}),
}));

import { runArbBetRound } from "@/stores/betting/runArbBetRound";

describe("runArbBetRound lose-order gate", () => {
  beforeEach(() => {
    Object.assign(config, createDefaultUserConfig());
    matchStoreState.matchs = [];
    processLoseOrders.mockClear();
    runA8ArbRound.mockClear();
    runKakaxiArbRound.mockClear();
  });

  it("processes lose orders when makeUp on even if betting off (A8 jb)", async () => {
    config.makeUp = true;
    config.betting = false;

    await runArbBetRound({ setMessage: () => {}, processLoseOrders });

    expect(processLoseOrders).toHaveBeenCalledOnce();
    expect(runA8ArbRound).not.toHaveBeenCalled();
    expect(runKakaxiArbRound).not.toHaveBeenCalled();
  });

  it("skips lose orders when makeUp off", async () => {
    config.makeUp = false;
    config.betting = true;

    await runArbBetRound({ setMessage: () => {}, processLoseOrders });

    expect(processLoseOrders).not.toHaveBeenCalled();
  });

  it("uses runA8ArbRound when arbDetectEngine is a8", async () => {
    config.betting = true;
    config.arbDetectEngine = "a8";

    await runArbBetRound({ setMessage: () => {}, processLoseOrders });

    expect(runA8ArbRound).toHaveBeenCalledOnce();
    expect(runKakaxiArbRound).not.toHaveBeenCalled();
  });

  it("uses runKakaxiArbRound when arbDetectEngine is kakaxi", async () => {
    config.betting = true;
    config.arbDetectEngine = "kakaxi";

    await runArbBetRound({ setMessage: () => {}, processLoseOrders });

    expect(runKakaxiArbRound).toHaveBeenCalledOnce();
    expect(runA8ArbRound).not.toHaveBeenCalled();
  });

  it("defaults to runA8ArbRound when arbDetectEngine unset", async () => {
    config.betting = true;
    config.arbDetectEngine = undefined;

    await runArbBetRound({ setMessage: () => {}, processLoseOrders });

    expect(runA8ArbRound).toHaveBeenCalledOnce();
    expect(runKakaxiArbRound).not.toHaveBeenCalled();
  });
});

describe("runArbBetRound betMoney (A8 rolls per bet in prepareArbAttempt)", () => {
  beforeEach(() => {
    Object.assign(config, createDefaultUserConfig());
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    runA8ArbRound.mockClear();
    runKakaxiArbRound.mockClear();
  });

  it("does not randomize when minMoney is 0 (A8 minMoney!==0 gate)", async () => {
    config.betMoney = 999;
    config.minMoney = 0;
    config.maxMoney = 100;
    config.betting = true;

    await runArbBetRound({ setMessage: () => {}, processLoseOrders });

    expect(config.betMoney).toBe(999);
  });

  it("skips randomize when maxMoney is 0", async () => {
    config.betMoney = 999;
    config.minMoney = 0;
    config.maxMoney = 0;
    config.betting = true;

    await runArbBetRound({ setMessage: () => {}, processLoseOrders });

    expect(config.betMoney).toBe(999);
  });

  it("does not randomize at round level", async () => {
    config.betting = true;
    config.betMoney = 999;
    config.minMoney = 10;
    config.maxMoney = 110;

    await runArbBetRound({ setMessage: () => {}, processLoseOrders });

    expect(config.betMoney).toBe(999);
  });
});
