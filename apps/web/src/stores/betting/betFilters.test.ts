import { describe, expect, it, vi } from "vitest";
import { BetOption } from "@/models/betOption";
import { PlatformAccount } from "@/models/platformAccount";
import { createBetLinkId } from "@/models/betResult";
import { isLegSkippedByRate9999 } from "@/stores/betting/betFilters";

vi.mock("@/stores/matchStore", () => ({
  useMatchStore: () => ({
    getDefaultOdds: () => undefined,
    getBetTarget: () => undefined,
  }),
}));

function makeAccount(patch: Record<string, unknown> = {}) {
  return new PlatformAccount({
    accountId: 1,
    playerName: "test",
    provider: "PB",
    balance: 1000,
    ...patch,
  });
}

function makeLeg(provider: "PB" | "RAY" = "PB"): BetOption {
  return {
    type: provider,
    target: "home",
    odds: 1.8,
    betMoney: 100,
  } as unknown as BetOption;
}

describe("createBetLinkId", () => {
  it("默认正数，对齐 A8 Date.now()", () => {
    const id = createBetLinkId(false);
    expect(id).toBeGreaterThan(0);
  });

  it("仅比例 9999 单边为负", () => {
    const id = createBetLinkId(true);
    expect(id).toBeLessThan(0);
  });
});

describe("isLegSkippedByRate9999", () => {
  const matchStore = {
    getBetTarget: () => undefined,
    getDefaultOdds: () => undefined,
  } as never;

  it("存在仅因 9999 被排除的候选时返回 true", () => {
    const leg = makeLeg("PB");
    const acc = makeAccount({
      accountId: 2,
      provider: "PB",
      rateConfig: [{ minOdds: 0, maxOdds: 0, rate: 9999 }],
    });
    acc.balance = 1000;
    expect(
      isLegSkippedByRate9999(leg, { id: 1 } as never, { game: "英雄联盟", gameId: 1 } as never, [acc], [], matchStore),
    ).toBe(true);
  });

  it("无 9999 候选时返回 false", () => {
    const leg = makeLeg("RAY");
    const acc = makeAccount({ accountId: 3, provider: "RAY" });
    acc.balance = 1000;
    expect(
      isLegSkippedByRate9999(leg, { id: 1 } as never, { game: "英雄联盟", gameId: 1 } as never, [acc], [], matchStore),
    ).toBe(false);
  });
});
