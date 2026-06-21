import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_ODDS_MS,
  LOSE_ORDER_PRUNE_MS,
  MAIN_LOOP_DELAY_MS,
  MATCH_POLL_MS,
  runMainBetLoopFinally,
  runMainBetLoopTick,
} from "@/stores/match/mainBetLoop";

interface ArbRoundCtx {
  setMessage: (msg: string) => void;
  processLoseOrders: () => void;
}

const runArbBetRound = vi.fn(async (_ctx: ArbRoundCtx) => {});
const fetchMatchDefaultOdds = vi.fn(async () => {});
const refreshOddsOnBets = vi.fn();
const fetchMatches = vi.fn(async () => {});

const matchStoreState = {
  lastFetchAt: Date.now(),
  defaultOddsFetchedAt: 0,
  matchs: [] as unknown[],
};

const userState = { userId: "u1" as string | null };

vi.mock("@/stores/betting/runArbBetRound", () => ({
  runArbBetRound: (ctx: ArbRoundCtx) => runArbBetRound(ctx),
}));

vi.mock("@/stores/userStore", () => ({
  useUserStore: () => userState,
}));

vi.mock("@/stores/matchStore", () => ({
  useMatchStore: () => ({
    ...matchStoreState,
    fetchMatches,
    refreshOddsOnBets,
    fetchMatchDefaultOdds,
  }),
}));

vi.mock("@/stores/oddsStore", () => ({
  useOddsStore: () => ({ clean: vi.fn() }),
}));

vi.mock("@/stores/loseOrderStore", () => ({
  useLoseOrderStore: () => ({
    ensureOrdersMap: vi.fn(),
    removeOrders: vi.fn(),
  }),
}));

vi.mock("@/stores/bettingStore", () => ({
  useBettingStore: () => ({
    tickAutoOpen: vi.fn(),
    setMessage: vi.fn(),
    processLoseOrders: vi.fn(async () => {}),
  }),
}));

describe("mainBetLoop constants", () => {
  it("matches A8 bundle P() timing", () => {
    expect(MAIN_LOOP_DELAY_MS).toBe(100);
    expect(MATCH_POLL_MS).toBe(30_000);
    expect(LOSE_ORDER_PRUNE_MS).toBe(60_000);
  });
});

describe("runMainBetLoopFinally", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
  });

  it("waits 100ms between ticks", async () => {
    const p = runMainBetLoopFinally();
    await vi.advanceTimersByTimeAsync(99);
    let settled = false;
    void p.then(() => {
      settled = true;
    });
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await p;
    expect(settled).toBe(true);
    vi.useRealTimers();
  });
});

describe("runMainBetLoopTick", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    userState.userId = "u1";
    matchStoreState.lastFetchAt = Date.now();
    matchStoreState.defaultOddsFetchedAt = 0;
    matchStoreState.matchs = [];
  });

  it("still runs arb round when match list is empty (A8 [] vs null)", async () => {
    await runMainBetLoopTick({ lastLoseOrderPruneAt: 0 });

    expect(runArbBetRound).toHaveBeenCalledOnce();
    expect(fetchMatchDefaultOdds).toHaveBeenCalledOnce();
  });

  it("refreshes odds between 30s polls when matches exist", async () => {
    matchStoreState.matchs = [{}];
    matchStoreState.defaultOddsFetchedAt = Date.now();

    await runMainBetLoopTick({ lastLoseOrderPruneAt: 0 });

    expect(refreshOddsOnBets).toHaveBeenCalledOnce();
    expect(runArbBetRound).toHaveBeenCalledOnce();
    expect(fetchMatchDefaultOdds).not.toHaveBeenCalled();
  });

  it("fetches default odds when gate elapsed", async () => {
    matchStoreState.matchs = [{}];
    matchStoreState.defaultOddsFetchedAt = Date.now() - DEFAULT_ODDS_MS - 1;

    await runMainBetLoopTick({ lastLoseOrderPruneAt: 0 });

    expect(fetchMatchDefaultOdds).toHaveBeenCalledOnce();
  });
});
