import { describe, expect, test } from "vitest";
import { rayMatchStage } from "./shared/match_stage";
import { groupRayOddsToSaveBets, listRayFoOddEntries } from "./shared/save_bets";

describe("RAY match_stage", () => {
  test("parses live API match_stage strings", () => {
    expect(rayMatchStage("final")).toBe(0);
    expect(rayMatchStage("r1")).toBe(1);
    expect(rayMatchStage("r2")).toBe(2);
    expect(rayMatchStage("R3")).toBe(3);
    expect(rayMatchStage("map1")).toBe(1);
    expect(rayMatchStage("map2")).toBe(2);
  });
});

describe("RAY groupRayOddsToSaveBets", () => {
  test("emits distinct Map per stage (not all Map=0)", () => {
    const bets = groupRayOddsToSaveBets(
      {
        id: 1,
        team: [
          { pos: 1, team_id: 10, team_name: "H" },
          { pos: 2, team_id: 20, team_name: "A" },
        ],
        odds: [
          { group_name: "获胜者", status: 1, odds_id: 1, odds_group_id: 100, match_stage: "final", team_id: 10, name: "H", odds: 2 },
          { group_name: "获胜者", status: 1, odds_id: 2, odds_group_id: 100, match_stage: "final", team_id: 20, name: "A", odds: 1.8 },
          { group_name: "获胜者", status: 1, odds_id: 3, odds_group_id: 101, match_stage: "r1", team_id: 10, name: "H", odds: 2.1 },
          { group_name: "获胜者", status: 1, odds_id: 4, odds_group_id: 101, match_stage: "r1", team_id: 20, name: "A", odds: 1.7 },
        ],
      },
      /^获胜者$/,
    );
    expect(bets.map((b) => b.Map)).toEqual([0, 1]);
    expect(bets[0]?.BetName).toBe("[全场] 获胜者");
    expect(bets[1]?.BetName).toBe("[地图1] 获胜者");
  });
});

describe("RAY listRayFoOddEntries", () => {
  test("skips status=4 and non-matching group_name", () => {
    const entries = listRayFoOddEntries(
      {
        team: [
          { pos: 1, team_id: 10 },
          { pos: 2, team_id: 20 },
        ],
        odds: [
          { group_name: "获胜者", status: 1, odds_id: 1, odds_group_id: 100, team_id: 10, odds: 2 },
          { group_name: "其它", status: 1, odds_id: 9, odds_group_id: 999, team_id: 10, odds: 3 },
          { group_name: "获胜者", status: 4, odds_id: 2, odds_group_id: 100, team_id: 20, odds: 1.8 },
        ],
      },
      /^获胜者$/,
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ id: "1", betId: "100", side: "home" });
  });
});
