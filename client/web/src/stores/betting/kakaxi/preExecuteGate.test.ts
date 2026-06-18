import { describe, expect, it, vi, beforeEach } from "vitest";
import { createDefaultUserConfig } from "@/types/userConfig";
import type { ViewBet, ViewMatch } from "@/models/match";

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

import { passesKakaxiPreExecuteGate } from "@/stores/betting/kakaxi/preExecuteGate";
import { clearKakaxiCooldowns, setKakaxiBetCooldown } from "@/stores/betting/kakaxi/cooldown";

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
});
