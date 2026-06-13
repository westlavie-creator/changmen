import { describe, expect, it } from "vitest";
import { PlatformAccount } from "@/models/platformAccount";

function makeAccount(patch: Record<string, unknown> = {}) {
  return new PlatformAccount({
    accountId: 1,
    playerName: "test",
    provider: "RAY",
    balance: 1000,
    ...patch,
  });
}

describe("PlatformAccount workTimes", () => {
  it("allows when workTimes empty", () => {
    const acc = makeAccount({ workTimes: [] });
    expect(acc.isPause()).toBe(false);
  });

  it("pauses outside configured hour range", () => {
    const hour = new Date().getHours();
    const outside = hour >= 12 ? `0-${hour - 1}` : `${hour + 2}-23`;
    const acc = makeAccount({ workTimes: [outside] });
    expect(acc.isPause()).toBe("不在工作时间");
  });
});

describe("PlatformAccount rateConfig", () => {
  it("applyPatch persists rateConfig through toJSON", () => {
    const acc = makeAccount();
    acc.applyPatch({
      rateConfig: [{ minOdds: 1.5, maxOdds: 2.5, rate: 0.5 }],
    });
    expect(acc.toJSON().rateConfig).toEqual([{ minOdds: 1.5, maxOdds: 2.5, rate: 0.5 }]);
    expect(acc.getBetMoney(100, 2)).toBe(50);
  });

  it("比例 9999 时不下注", () => {
    const acc = makeAccount({
      rateConfig: [{ minOdds: 0, maxOdds: 0, rate: 9999 }],
    });
    expect(acc.canBetAtOdds(1.8)).toBe(false);
    expect(acc.getBetMoney(100, 1.8)).toBe(0);
  });

  it("无匹配比例行时按全额 1", () => {
    const acc = makeAccount({
      rateConfig: [{ minOdds: 2, maxOdds: 3, rate: 0.5 }],
    });
    expect(acc.getBetMoney(100, 1.5)).toBe(100);
    expect(acc.canBetAtOdds(1.5)).toBe(true);
  });
});

describe("PlatformAccount game settings", () => {
  it("requires implied profit when game profit set", () => {
    const acc = makeAccount({
      game: { 英雄联盟: { betCount: 0, profit: 1.1, odds: [] } },
    });
    expect(acc.passesGameSettings("英雄联盟", 2, 1.05)).toBe(false);
    expect(acc.passesGameSettings("英雄联盟", 2, 1.12)).toBe(true);
  });

  it("requires odds within configured ranges", () => {
    const acc = makeAccount({
      game: { 英雄联盟: { betCount: 0, profit: 0, odds: ["1.5-2.5"] } },
    });
    expect(acc.passesGameSettings("英雄联盟", 1.4)).toBe(false);
    expect(acc.passesGameSettings("英雄联盟", 2)).toBe(true);
  });
});
