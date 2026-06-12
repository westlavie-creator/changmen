import test from "node:test";
import assert from "node:assert/strict";
import { buildBetsForMatch } from "../merge/bet_builder.js";

const src = (p, b) => ({
  Type: p,
  BetID: String(b.SourceBetID),
  HomeID: String(b.SourceHomeID),
  AwayID: String(b.SourceAwayID),
  HomeOdds: b.HomeOdds,
  AwayOdds: b.AwayOdds,
  Status: b.Status,
});

test("IA Map3: 无地图获胜者时排除第二手枪局", () => {
  const bets = {
    "IA:373450": {
      provider: "IA",
      matchId: "373450",
      bets: [
        {
          SourceBetID: "15337799",
          Map: 0,
          BetName: "[全场] 获胜",
          SourceHomeID: "h0",
          HomeOdds: 1.06,
          SourceAwayID: "a0",
          AwayOdds: 8,
          Status: "Normal",
        },
        {
          SourceBetID: "15337801",
          Map: 1,
          BetName: "[地图1] 获胜者",
          SourceHomeID: "h1",
          HomeOdds: 1.18,
          SourceAwayID: "a1",
          AwayOdds: 4.5,
          Status: "Normal",
        },
        {
          SourceBetID: "15337950",
          Map: 3,
          BetName: "[地图3] 第二手枪局获胜者",
          SourceHomeID: "h3",
          HomeOdds: 1.62,
          SourceAwayID: "a3",
          AwayOdds: 2.17,
          Status: "Normal",
        },
      ],
    },
  };
  const out = buildBetsForMatch("IA", "373450", 0, bets, src, "cs2");
  const maps = out.map((b) => b.Map);
  assert.deepEqual(maps, [0, 1]);
  assert.equal(out.find((b) => b.Map === 3), undefined);
});

test("IA Map2: 地图获胜者 wins over 第二手枪局 when both present", () => {
  const bets = {
    "IA:1": {
      provider: "IA",
      matchId: "1",
      bets: [
        {
          SourceBetID: "pistol",
          Map: 2,
          BetName: "[地图2] 第二手枪局获胜者",
          SourceHomeID: "h1",
          HomeOdds: 1.62,
          SourceAwayID: "a1",
          AwayOdds: 2.17,
          Status: "Normal",
        },
        {
          SourceBetID: "map",
          Map: 2,
          BetName: "[地图2] 获胜者",
          SourceHomeID: "h2",
          HomeOdds: 1.18,
          SourceAwayID: "a2",
          AwayOdds: 4.5,
          Status: "Normal",
        },
      ],
    },
  };
  const out = buildBetsForMatch("IA", "1", 0, bets, src, "cs2");
  assert.equal(out.length, 1);
  assert.equal(out[0].Name, "[地图2] 获胜者");
  assert.equal(out[0].Sources.IA.BetID, "map");
});
