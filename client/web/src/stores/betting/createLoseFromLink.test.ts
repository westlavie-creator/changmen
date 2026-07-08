import type { ViewMatch } from "@/models/match";
import { LoseOrder } from "@/models/loseOrder";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveMatchBetForLink } from "@/stores/betting/createLoseFromLink";
import { loadLinkBetContext, saveLinkBetContext } from "@/stores/betting/linkBetContext";

function makeMatches() {
  return [
    {
      id: 10,
      title: "Team A vs Team B",
      bets: [
        { id: 100, round: 1, getBetName: () => "[地图1] 获胜" },
      ],
    },
  ] as unknown as ViewMatch[];
}

function mockSessionStorage() {
  const data = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => {
      data.clear();
    },
  });
}

describe("resolveMatchBetForLink", () => {
  beforeEach(() => {
    mockSessionStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves from persisted link bet context", () => {
    saveLinkBetContext(888, 10, 100);
    const resolved = resolveMatchBetForLink(makeMatches(), 888);
    expect(resolved?.match.id).toBe(10);
    expect(resolved?.bet.id).toBe(100);
    expect(loadLinkBetContext(888)?.betId).toBe(100);
  });

  it("resolves from link-bound lose order", () => {
    const resolved = resolveMatchBetForLink(makeMatches(), 777, {
      loseOrders: [
        new LoseOrder({
          linkId: 777,
          matchId: 10,
          betId: 100,
          match: "Team A vs Team B",
          bet: "[地图1] 获胜",
          accountId: 1,
          target: "Home",
          betMoney: 100,
          betOdds: 2,
          createAt: Date.now(),
          isCreateOrder: false,
          betCount: 1,
        }),
      ],
    });
    expect(resolved?.bet.id).toBe(100);
  });
});
