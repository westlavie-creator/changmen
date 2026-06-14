import { describe, expect, test } from "vitest";
import {
  buildIaSaveBetRowsFromPlays,
  iaMainWinBetKey,
  listIaChildFoOddEntries,
} from "./save_bets";

const BET_RE = new RegExp("(\\[全场\\].+获胜$)|(\\[地图\\d+\\]\\s*获胜者$)");

function iaChild(partial: Record<string, unknown>): Record<string, unknown> {
  return {
    status: 1,
    match: 0,
    name: " 获胜",
    team_points: [
      { id: "h", name: "Home", point: 1.5, status: 1 },
      { id: "a", name: "Away", point: 2.5, status: 1 },
    ],
    ...partial,
  };
}

describe("iaMainWinBetKey", () => {
  test("accepts full/map winner, rejects pistol and round bets", () => {
    expect(iaMainWinBetKey("[全场] 获胜")).toBe(true);
    expect(iaMainWinBetKey("[地图1] 获胜者")).toBe(true);
    expect(iaMainWinBetKey("[地图3] 第二手枪局获胜者")).toBe(false);
    expect(iaMainWinBetKey("[地图1] 第二十二回合")).toBe(false);
  });
});

describe("buildIaSaveBetRowsFromPlays", () => {
  test("Map3: map winner included, second pistol excluded", () => {
    const plays = [
      {
        child_plays: [
          iaChild({ id: "15337799", match: 0, name: " 获胜" }),
          iaChild({ id: "15337801", match: 1, name: " 获胜者" }),
          iaChild({ id: "15337950", match: 3, name: " 第二手枪局获胜者" }),
        ],
      },
    ];
    const rows = buildIaSaveBetRowsFromPlays(plays, "373450", BET_RE);
    expect(rows.map((r) => r.Map)).toEqual([0, 1]);
    expect(rows.find((r) => r.Map === 3)).toBeUndefined();
  });

  test("Map2: map winner included when pistol also listed", () => {
    const plays = [
      {
        child_plays: [
          iaChild({
            id: "pistol",
            match: 2,
            name: " 第二手枪局获胜者",
            team_points: [
              { id: "h1", point: 1.62, status: 1 },
              { id: "a1", point: 2.17, status: 1 },
            ],
          }),
          iaChild({
            id: "map",
            match: 2,
            name: " 获胜者",
            team_points: [
              { id: "h2", point: 1.18, status: 1 },
              { id: "a2", point: 4.5, status: 1 },
            ],
          }),
        ],
      },
    ];
    const rows = buildIaSaveBetRowsFromPlays(plays, "1", BET_RE);
    expect(rows).toHaveLength(1);
    expect(rows[0].BetName).toBe("[地图2] 获胜者");
    expect(rows[0].SourceBetID).toBe("map");
  });

  test("child.status closed but points open stays Normal (live BO5 full match)", () => {
    const child = iaChild({ id: "full", status: 0, match: 0, name: " 获胜" });
    const rows = buildIaSaveBetRowsFromPlays([{ child_plays: [child] }], "m1", BET_RE);
    expect(rows[0].Status).toBe("Normal");
    expect(rows[0].HomeOdds).toBeGreaterThan(0);
  });

  test("locked when all present points are closed", () => {
    const child = iaChild({
      id: "x",
      team_points: [
        { id: "h", name: "Home", point: 1.5, status: 0 },
        { id: "a", name: "Away", point: 2.5, status: 0 },
      ],
    });
    const rows = buildIaSaveBetRowsFromPlays([{ child_plays: [child] }], "m1", BET_RE);
    expect(rows[0].Status).toBe("Locked");
  });

  test("live status=2 on points stays Normal (BO5 full match 373635)", () => {
    const child = iaChild({
      id: "15348896",
      status: 2,
      match: 0,
      team_points: [
        { id: "51285134", point: 1.55, status: 2 },
        { id: "51285135", point: 2.35, status: 2 },
      ],
    });
    const rows = buildIaSaveBetRowsFromPlays([{ child_plays: [child] }], "373635", BET_RE);
    expect(rows).toHaveLength(1);
    expect(rows[0].Status).toBe("Normal");
    expect(rows[0].HomeOdds).toBe(1.55);
    expect(rows[0].AwayOdds).toBe(2.35);
  });

  test("settled status=4 on points is Locked", () => {
    const child = iaChild({
      id: "15348897",
      match: 1,
      name: " 获胜者",
      team_points: [
        { id: "51285136", point: 21, status: 4 },
        { id: "51285137", point: 1.001, status: 4 },
      ],
    });
    const rows = buildIaSaveBetRowsFromPlays([{ child_plays: [child] }], "373635", BET_RE);
    expect(rows[0].Status).toBe("Locked");
  });
});

describe("listIaChildFoOddEntries", () => {
  test("uses point status not child.status for fo lock", () => {
    const child = iaChild({
      id: "play-full",
      status: 0,
      match: 0,
      team_points: [
        { id: "h", point: 1.72, status: 1 },
        { id: "a", point: 2.1, status: 1 },
      ],
    });
    const entries = listIaChildFoOddEntries(child);
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.isLock === false)).toBe(true);
  });

  test("status=2 fo entries are not locked", () => {
    const child = iaChild({
      id: "play-full",
      status: 2,
      match: 0,
      team_points: [
        { id: "51285134", point: 1.55, status: 2 },
        { id: "51285135", point: 2.35, status: 2 },
      ],
    });
    const entries = listIaChildFoOddEntries(child);
    expect(entries.every((e) => e.isLock === false)).toBe(true);
  });
});
