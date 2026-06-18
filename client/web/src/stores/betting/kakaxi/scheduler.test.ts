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
  processNextKakaxiBet,
  resetKakaxiScheduler,
} from "@/stores/betting/kakaxi/scheduler";

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
    enqueueKakaxiBet({
      matchId: 100,
      betId: 1,
      enqueuedAt: 1,
      implied: 1.1,
      isLive: true,
    });

    const ran = await processNextKakaxiBet({ setMessage: () => {} });

    expect(ran).toBe(true);
    expect(executeArbBet).toHaveBeenCalledOnce();
    expect(getKakaxiInFlightKey()).toBeNull();
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
    executeArbBet.mockClear();
    matchStoreState.matchs = [
      { id: 100, bets: [{ id: 1 }, { id: 2 }] },
    ];
  });

  it("processes all queued bets serially", async () => {
    enqueueKakaxiBet({
      matchId: 100,
      betId: 1,
      enqueuedAt: 1,
      implied: 1.1,
      isLive: false,
    });
    enqueueKakaxiBet({
      matchId: 100,
      betId: 2,
      enqueuedAt: 2,
      implied: 1.2,
      isLive: false,
    });

    const count = await drainKakaxiScheduler({ setMessage: () => {} });

    expect(count).toBe(2);
    expect(executeArbBet).toHaveBeenCalledTimes(2);
  });
});
