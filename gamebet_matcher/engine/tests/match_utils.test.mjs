import { describe, expect, it } from "vitest";
import { betKey, formatTitle, isPlaceholderTeamName, stableId } from "../teams/match_utils.js";

describe("match_utils", () => {
  it("builds stable non-zero ids from the same seed", () => {
    expect(stableId("OB:match-1")).toBe(stableId("OB:match-1"));
    expect(stableId("OB:match-1")).not.toBe(stableId("RAY:match-1"));
    expect(stableId("")).toBe(1);
  });

  it("formats match titles with useful fallbacks", () => {
    expect(formatTitle(" Team A ", " Team B ")).toBe("Team A vs Team B");
    expect(formatTitle("Team A", "")).toBe("Team A");
    expect(formatTitle("", "")).toBe("Unknown");
  });

  it("builds provider scoped bet keys and detects placeholder teams", () => {
    expect(betKey("OB", 123)).toBe("OB:123");
    expect(isPlaceholderTeamName("主队")).toBe(true);
    expect(isPlaceholderTeamName("客队")).toBe(true);
    expect(isPlaceholderTeamName("Unknown")).toBe(true);
    expect(isPlaceholderTeamName("Natus Vincere")).toBe(false);
  });
});
