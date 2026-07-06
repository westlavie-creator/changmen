import { describe, expect, it } from "vitest";
import {
  normalizeAccountRateConfig,
  PlatformAccount,
  resolveAccountPauseReason,
} from "@/models/platformAccount";
import { isSingleLegRateAtOdds } from "@/domain/betting/singleLegRate";

function makeAccount(patch: Record<string, unknown> = {}) {
  return new PlatformAccount({
    accountId: 1,
    playerName: "test",
    provider: "RAY",
    balance: 1000,
    ...patch,
  });
}

describe("resolveAccountPauseReason", () => {
  it("returns manual pause reason", () => {
    expect(resolveAccountPauseReason({ pause: true })).toBe("手动设定账号暂停");
  });

  it("returns max order reason", () => {
    expect(resolveAccountPauseReason({ maxOrder: 10, todayOrder: 10 })).toMatch(/超过设定 10/);
  });
});

describe("platformAccount workTimes", () => {
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

describe("platformAccount currency exchange", () => {
  it("getBalance 按汇率换算为 CNY 口径", () => {
    const acc = makeAccount({ currency: "USDT" });
    acc.balance = 10;
    expect(acc.getBalance()).toBe(68);
  });

  it("getBetMoney 先将 CNY 金额按账号汇率折算", () => {
    const acc = makeAccount({
      currency: "USDT",
      rateConfig: [{ minOdds: 0, maxOdds: 0, rate: 1 }],
    });
    expect(acc.getBetMoney(70, 1.8)).toBe(10);
  });
});

describe("normalizeAccountRateConfig", () => {
  it("drops rate===0 rows like A8 save", () => {
    expect(
      normalizeAccountRateConfig([
        { minOdds: 0, maxOdds: 0, rate: 0 },
        { minOdds: 1.5, maxOdds: 2.5, rate: 0.5 },
      ]),
    ).toEqual([{ minOdds: 1.5, maxOdds: 2.5, rate: 0.5 }]);
  });

  it("drops NaN rate rows", () => {
    expect(
      normalizeAccountRateConfig([{ minOdds: 0, maxOdds: 0, rate: Number.NaN }]),
    ).toEqual([]);
  });
});

describe("platformAccount rateConfig", () => {
  it("constructor normalizes persisted string rate rows", () => {
    const acc = makeAccount({
      rateConfig: [{ minOdds: "0", maxOdds: "0", rate: "9999" }],
    });

    expect(acc.toJSON().rateConfig).toEqual([{ minOdds: 0, maxOdds: 0, rate: 9999 }]);
    expect(isSingleLegRateAtOdds(acc, 2.05)).toBe(true);
  });

  it("applyPatch persists rateConfig through toJSON", () => {
    const acc = makeAccount();
    acc.applyPatch({
      rateConfig: [{ minOdds: 1.5, maxOdds: 2.5, rate: 0.5 }],
    });
    expect(acc.toJSON().rateConfig).toEqual([{ minOdds: 1.5, maxOdds: 2.5, rate: 0.5 }]);
    expect(acc.getBetMoney(100, 2)).toBe(50);
  });

  it("applyPatch drops rate===0 rows", () => {
    const acc = makeAccount();
    acc.applyPatch({
      rateConfig: [
        { minOdds: 0, maxOdds: 0, rate: 0 },
        { minOdds: 0, maxOdds: 0, rate: 9999 },
      ],
    });
    expect(acc.toJSON().rateConfig).toEqual([{ minOdds: 0, maxOdds: 0, rate: 9999 }]);
  });

  it("比例 9999 按 A8 当作乘数", () => {
    const acc = makeAccount({
      rateConfig: [{ minOdds: 0, maxOdds: 0, rate: 9999 }],
    });
    expect(acc.getBetMoney(100, 1.8)).toBe(999900);
  });

  it("无匹配比例行时按全额 1", () => {
    const acc = makeAccount({
      rateConfig: [{ minOdds: 2, maxOdds: 3, rate: 0.5 }],
    });
    expect(acc.getBetMoney(100, 1.5)).toBe(100);
  });
});

describe("platformAccount game settings", () => {
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
