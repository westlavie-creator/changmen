import type { ArbLegs } from "@/domain/arbitrage";
import type { ViewBet, ViewMatch } from "@/models/match";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearKakaxiCooldowns, setKakaxiBetCooldown } from "@/stores/betting/kakaxi/cooldown";

import { passesKakaxiPreExecuteGate, shouldRequeueAfterKakaxiGate } from "@/stores/betting/kakaxi/preExecuteGate";
import { createDefaultUserConfig } from "@/types/userConfig";

const config = createDefaultUserConfig();
const loseOrders = new Set<number>();

vi.mock("@/stores/oddsStore", () => ({
  useOddsStore: () => ({
    getOdds: () => 2.0,
  }),
}));

vi.mock("@/stores/loseOrderStore", () => ({
  useLoseOrderStore: () => ({
    orders: { has: (id: number) => loseOrders.has(id) },
  }),
}));

vi.mock("@/domain/arbitrage", () => ({
  pickArbLegs: vi.fn(() => ({
    homeItem: { type: "OB" },
    awayItem: { type: "RAY" },
    homeOdds: 2.2,
    awayOdds: 2.1,
    implied: 1.08,
  })),
}));

function makeMatchBet(): { match: ViewMatch; bet: ViewBet } {
  const bet = {
    id: 1,
    items: [
      {
        type: "OB",
        betId: "b1",
        homeId: "h1",
        awayId: "a1",
        updateOdds: vi.fn(),
        getOdds: (side: string) => (side === "Home" ? 2.2 : 2.0),
      },
      {
        type: "RAY",
        betId: "b2",
        homeId: "h2",
        awayId: "a2",
        updateOdds: vi.fn(),
        getOdds: (side: string) => (side === "Home" ? 2.1 : 2.1),
      },
    ],
    getBetName: () => "R1",
  } as unknown as ViewBet;
  const match = { id: 100, game: "英雄联盟", gameId: 1, bets: [bet] } as unknown as ViewMatch;
  return { match, bet };
}

describe("passesKakaxiPreExecuteGate", () => {
  beforeEach(() => {
    clearKakaxiCooldowns();
    loseOrders.clear();
    Object.assign(config, createDefaultUserConfig());
    config.profit = 1.0;
  });

  it("passes when pickArbLegs finds opportunity", () => {
    const { match, bet } = makeMatchBet();
    const result = passesKakaxiPreExecuteGate({
      match,
      bet,
      item: { matchId: 100, betId: 1, enqueuedAt: Date.now(), implied: 1.05, isLive: false },
      config,
      providerKeys: ["OB", "RAY"],
      accounts: [],
    });
    expect(result.ok).toBe(true);
  });

  it("blocks when on cooldown", () => {
    setKakaxiBetCooldown(100, 1);
    const { match, bet } = makeMatchBet();
    const result = passesKakaxiPreExecuteGate({
      match,
      bet,
      item: { matchId: 100, betId: 1, enqueuedAt: Date.now(), implied: 1.05, isLive: false },
      config,
      providerKeys: ["OB", "RAY"],
      accounts: [],
    });
    expect(result).toEqual({ ok: false, reason: "cooldown" });
  });

  it("blocks when bet is in lose order queue", () => {
    loseOrders.add(1);
    const { match, bet } = makeMatchBet();
    const result = passesKakaxiPreExecuteGate({
      match,
      bet,
      item: { matchId: 100, betId: 1, enqueuedAt: Date.now(), implied: 1.05, isLive: false },
      config,
      providerKeys: ["OB", "RAY"],
      accounts: [],
    });
    expect(result).toEqual({ ok: false, reason: "lose_order" });
  });

  it("returns stale_implied with current implied when legs lag queue", () => {
    const { match, bet } = makeMatchBet();
    const result = passesKakaxiPreExecuteGate({
      match,
      bet,
      item: { matchId: 100, betId: 1, enqueuedAt: Date.now(), implied: 1.2, isLive: false },
      config,
      providerKeys: ["OB", "RAY"],
      accounts: [],
      legs: {
        homeItem: { type: "OB" },
        awayItem: { type: "RAY" },
        homeOdds: 2.0,
        awayOdds: 2.0,
        implied: 1.05,
      } as ArbLegs,
    });
    expect(result).toEqual({ ok: false, reason: "stale_implied", implied: 1.05 });
    expect(shouldRequeueAfterKakaxiGate("stale_implied")).toBe(true);
    expect(shouldRequeueAfterKakaxiGate("ttl")).toBe(false);
  });
});
