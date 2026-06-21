import type { KakaxiPreGateResult } from "@/stores/betting/kakaxi/preExecuteGate";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearKakaxiQueue,
  enqueueKakaxiBet,
  hasKakaxiBet,
  kakaxiQueueSize,
} from "@/stores/betting/kakaxi/queue";

import {
  armKakaxiScheduler,
  processNextKakaxiBet,
  resetKakaxiScheduler,
} from "@/stores/betting/kakaxi/scheduler";
import { createDefaultUserConfig } from "@/types/userConfig";

const config = createDefaultUserConfig();
const matchStoreState = {
  matchs: [
    {
      id: 100,
      game: "英雄联盟",
      bets: [
        {
          id: 1,
          items: [
            { type: "OB", updateOdds: vi.fn() },
            { type: "RAY", updateOdds: vi.fn() },
          ],
        },
      ],
    },
  ],
};
const executeArbBet = vi.fn(async (_params: unknown) => {});
const passesKakaxiPreExecuteGate = vi.fn((): KakaxiPreGateResult => ({ ok: true }));

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
  passesKakaxiPreExecuteGate: () => passesKakaxiPreExecuteGate(),
  shouldRequeueAfterKakaxiGate: (reason: string | undefined) => reason === "stale_implied",
}));

vi.mock("@/domain/arbitrage", () => ({
  pickArbLegs: () => ({
    homeItem: { type: "OB" },
    awayItem: { type: "RAY" },
    homeOdds: 2.2,
    awayOdds: 2.1,
    implied: 1.05,
  }),
}));

vi.mock("@/stores/betting/autoBet/executeArbBet", () => ({
  executeArbBet: (params: unknown) => executeArbBet(params),
}));

afterEach(() => {
  clearKakaxiQueue();
  resetKakaxiScheduler();
});

describe("executeKakaxiQueuedBet gate requeue", () => {
  beforeEach(() => {
    armKakaxiScheduler();
    Object.assign(config, createDefaultUserConfig());
    config.betting = true;
    executeArbBet.mockClear();
    passesKakaxiPreExecuteGate.mockReset();
    passesKakaxiPreExecuteGate.mockReturnValue({ ok: true });
  });

  it("requeues on stale_implied without calling executeArbBet", async () => {
    passesKakaxiPreExecuteGate.mockReturnValue({
      ok: false,
      reason: "stale_implied",
      implied: 1.04,
    });
    enqueueKakaxiBet({
      matchId: 100,
      betId: 1,
      enqueuedAt: Date.now(),
      implied: 1.1,
      isLive: false,
      homePlatform: "OB",
      awayPlatform: "RAY",
    });

    const ran = await processNextKakaxiBet({ setMessage: () => {} });

    expect(ran).toBe(false);
    expect(executeArbBet).not.toHaveBeenCalled();
    expect(kakaxiQueueSize()).toBe(1);
    expect(hasKakaxiBet(100, 1)).toBe(true);
  });

  it("drops on ttl without requeue", async () => {
    passesKakaxiPreExecuteGate.mockReturnValue({
      ok: false,
      reason: "ttl",
    });
    enqueueKakaxiBet({
      matchId: 100,
      betId: 1,
      enqueuedAt: Date.now(),
      implied: 1.1,
      isLive: false,
      homePlatform: "OB",
      awayPlatform: "RAY",
    });

    await processNextKakaxiBet({ setMessage: () => {} });

    expect(kakaxiQueueSize()).toBe(0);
  });
});
