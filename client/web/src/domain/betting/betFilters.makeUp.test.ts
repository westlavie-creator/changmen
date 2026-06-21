import { describe, expect, it } from "vitest";
import { passesMakeUpAccountFilter } from "@/domain/betting/betFilters";
import { PlatformAccount } from "@/models/platformAccount";

const matchStore = {
  getBetTarget: () => undefined,
  getDefaultOdds: (_betId: number, _side: string) => 1.9,
};

describe("passesMakeUpAccountFilter (A8 jb getAccount filter)", () => {
  function acc(patch: Record<string, unknown> = {}) {
    return new PlatformAccount({
      accountId: 1,
      playerName: "ob1",
      provider: "OB",
      balance: 1000,
      ...patch,
    });
  }

  it("排除 pause / noMarkup", () => {
    expect(
      passesMakeUpAccountFilter(acc({ pause: true }), 2.0, 1, "Home", matchStore),
    ).toBe(false);
    expect(
      passesMakeUpAccountFilter(acc({ noMarkup: true }), 2.0, 1, "Home", matchStore),
    ).toBe(false);
  });

  it("检查账号 minOdds / maxOdds", () => {
    expect(
      passesMakeUpAccountFilter(acc({ minOdds: 2.1 }), 2.0, 1, "Home", matchStore),
    ).toBe(false);
    expect(
      passesMakeUpAccountFilter(acc({ maxOdds: 1.9 }), 2.0, 1, "Home", matchStore),
    ).toBe(false);
  });

  it("检查初赔 minDefault / maxDefault", () => {
    expect(
      passesMakeUpAccountFilter(acc({ minDefault: 2.0 }), 2.1, 1, "Home", matchStore),
    ).toBe(false);
    expect(
      passesMakeUpAccountFilter(acc({ maxDefault: 2.0 }), 2.1, 1, "Home", matchStore),
    ).toBe(true);
    expect(
      passesMakeUpAccountFilter(acc({ maxDefault: 1.8 }), 2.1, 1, "Home", matchStore),
    ).toBe(false);
  });
});
