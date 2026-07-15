import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("sport / esport UI isolation", () => {
  test("BetRow does not import sportOddsStore", () => {
    const src = readFileSync(join(root, "components/match/BetRow.vue"), "utf8");
    expect(src).not.toMatch(/from\s+["']@\/stores\/sportOddsStore["']/);
    expect(src).not.toMatch(/useSportOddsStore/);
  });

  test("SportMatchBoard owns sportOddsStore and passes oddsDisplayTick", () => {
    const src = readFileSync(join(root, "components/match/SportMatchBoard.vue"), "utf8");
    expect(src).toMatch(/useSportOddsStore/);
    expect(src).toMatch(/odds-display-tick/);
  });

  test("sportLiveOdds does not import fo / saveVenueOdds", () => {
    const src = readFileSync(join(root, "runtime/sportLiveOdds.ts"), "utf8");
    expect(src).not.toMatch(/from\s+["']@\/stores\/oddsStore["']/);
    expect(src).not.toMatch(/useOddsStore/);
    expect(src).not.toMatch(/from\s+["'][^"']*oddsAccess["']/);
  });
});
