import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultUserConfig } from "@/types/userConfig";

const config = createDefaultUserConfig();
const matchStoreState = {
  matchs: [{ id: 100, bets: [{ id: 1 }] }],
};
const executeArbBet = vi.fn(async (_params: unknown) => {});

vi.mock("@/stores/configStore", () => ({
  useConfigStore: () => ({ config }),
}));

vi.mock("@/stores/matchStore", () => ({
  useMatchStore: () => matchStoreState,
}));

vi.mock("@/stores/accountStore", () => ({
  useAccountStore: () => ({
    getProviders: () => new Map([["OB", {}], ["RAY", {}]]),
    accounts: [],
  }),
}));

vi.mock("@/stores/betting/kakaxi/preExecuteGate", () => ({
  passesKakaxiPreExecuteGate: () => ({ ok: true }),
}));

vi.mock("@/stores/betting/autoBet/executeArbBet", () => ({
  executeArbBet: (params: unknown) => executeArbBet(params),
}));

import {
  clearKakaxiQueue,
  enqueueKakaxiBet,
} from "@/stores/betting/kakaxi/queue";
import {
  drainKakaxiScheduler,
  getKakaxiInFlightKey,
  getKakaxiInFlightPlatforms,
  processNextKakaxiBet,
  resetKakaxiScheduler,
} from "@/stores/betting/kakaxi/scheduler";

function enqueueWithPlatforms(
  matchId: number,
  betId: number,
  implied: number,
  homePlatform: "OB" | "RAY" | "TF" | "PB",
  awayPlatform: "OB" | "RAY" | "TF" | "PB",
) {
  enqueueKakaxiBet({
    matchId,
    betId,
    enqueuedAt: betId,
    implied,
    isLive: false,
    homePlatform,
    awayPlatform,
  });
}

afterEach(() => {
  clearKakaxiQueue();
  resetKakaxiScheduler();
});

describe("processNextKakaxiBet", () => {
  beforeEach(() => {
    Object.assign(config, createDefaultUserConfig());
    config.betting = true;
    executeArbBet.mockClear();
    matchStoreState.matchs = [{ id: 100, bets: [{ id: 1 }] }];
  });

  it("calls executeArbBet for queued bet", async () => {
    enqueueWithPlatforms(100, 1, 1.1, "OB", "RAY");

    const ran = await processNextKakaxiBet({ setMessage: () => {} });

    expect(ran).toBe(true);
    expect(executeArbBet).toHaveBeenCalledOnce();
    expect(getKakaxiInFlightKey()).toBeNull();
    expect(getKakaxiInFlightPlatforms().size).toBe(0);
  });

  it("returns false when queue empty", async () => {
    const ran = await processNextKakaxiBet({ setMessage: () => {} });
    expect(ran).toBe(false);
    expect(executeArbBet).not.toHaveBeenCalled();
  });
});

describe("drainKakaxiScheduler", () => {
  beforeEach(() => {
    config.betting = true;
    executeArbBet.mockReset();
    executeArbBet.mockResolvedValue(undefined);
    executeArbBet.mockClear();
    matchStoreState.matchs = [
      { id: 100, bets: [{ id: 1 }, { id: 2 }] },
    ];
  });

  it("processes all queued bets serially when platforms overlap", async () => {
    enqueueWithPlatforms(100, 1, 1.1, "OB", "RAY");
    enqueueWithPlatforms(100, 2, 1.2, "OB", "PB");

    const count = await drainKakaxiScheduler({ setMessage: () => {} });

    expect(count).toBe(2);
    expect(executeArbBet).toHaveBeenCalledTimes(2);
  });

  it("runs non-overlapping legs in parallel within one wave", async () => {
    let inFlight = 0;
    let maxConcurrent = 0;
    const gates: Array<() => void> = [];

    executeArbBet.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          inFlight += 1;
          maxConcurrent = Math.max(maxConcurrent, inFlight);
          gates.push(() => {
            inFlight -= 1;
            resolve();
          });
        }),
    );

    enqueueWithPlatforms(100, 1, 1.1, "OB", "RAY");
    enqueueWithPlatforms(100, 2, 1.2, "TF", "PB");
    matchStoreState.matchs = [
      { id: 100, bets: [{ id: 1 }, { id: 2 }] },
    ];

    const drainPromise = drainKakaxiScheduler(
      { setMessage: () => {} },
      { maxBets: 2, maxParallel: 4 },
    );

    await Promise.resolve();
    await Promise.resolve();
    expect(gates.length).toBe(2);

    gates.forEach((open) => open());
    const count = await drainPromise;

    expect(count).toBe(2);
    expect(maxConcurrent).toBe(2);
  });

  it("respects drain budget maxBets", async () => {
    matchStoreState.matchs = [
      {
        id: 100,
        bets: Array.from({ length: 8 }, (_, j) => ({ id: j + 1 })),
      },
    ];
    for (let i = 1; i <= 8; i++) {
      enqueueWithPlatforms(100, i, 1.1, "OB", "RAY");
    }

    const count = await drainKakaxiScheduler({ setMessage: () => {} }, { maxBets: 3 });

    expect(count).toBe(3);
    expect(executeArbBet).toHaveBeenCalledTimes(3);
  });
});
