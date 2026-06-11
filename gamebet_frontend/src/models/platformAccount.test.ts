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
