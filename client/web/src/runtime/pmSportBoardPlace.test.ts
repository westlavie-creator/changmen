import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { formatPmSportBoardPlaceTitle } from "@/runtime/pmSportBoardPlace";

describe("pmSportBoardPlace", () => {
  it("formats confirm title", () => {
    expect(formatPmSportBoardPlaceTitle({
      oid: "token",
      betId: "cond",
      odds: 2.12,
      boardSide: "away",
      marketCode: "spreads",
      line: -0.5,
      home: "A",
      away: "B",
    })).toBe("A vs B · 全场让球 -0.5 · 客 @ 2.12");
  });

  it("syncs PM vault keys before board manual betting", () => {
    const source = readFileSync(join(process.cwd(), "src/runtime/pmSportBoardPlace.ts"), "utf8");
    expect(source).toMatch(/ensurePmFootballAccountsHaveVaultKeys/);
    expect(source).toMatch(/const vaultBlock = await ensurePmFootballAccountsHaveVaultKeys\(\)/);
    expect(source.indexOf("ensurePmFootballAccountsHaveVaultKeys")).toBeLessThan(
      source.indexOf("listPmFollowAccounts"),
    );
  });

  it("does not fall back to the deprecated default POD stake", () => {
    const source = readFileSync(join(process.cwd(), "src/runtime/pmSportBoardPlace.ts"), "utf8");
    expect(source).toMatch(/defaultStake:\s*Number\(settings\.pmStake\) \|\| 0/);
    expect(source).not.toMatch(/defaultStake:[\s\S]{0,80}settings\.stake/);
  });
});
