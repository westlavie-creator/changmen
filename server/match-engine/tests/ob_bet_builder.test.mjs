import assert from "node:assert/strict";
import test from "node:test";
import { buildBetsForMatch } from "../merge/bet_builder.js";

function src(p, b) {
  return {
    Type: p,
    BetID: String(b.SourceBetID),
    HomeID: String(b.SourceHomeID),
    AwayID: String(b.SourceAwayID),
    HomeOdds: b.HomeOdds,
    AwayOdds: b.AwayOdds,
    Status: b.Status,
  };
}

test("OB CS2 Map1: 单局-获胜 wins over 第一手枪局 when pistol listed first", () => {
  const bets = {
    "OB:4272745136855916": {
      provider: "OB",
      matchId: "4272745136855916",
      bets: [
        {
          SourceBetID: "5561517900269057",
          Map: 1,
          BetName: "[地图1]-第一手枪局获胜",
          SourceHomeID: "5561517900269600",
          HomeOdds: 1.649,
          SourceAwayID: "5561517900269601",
          AwayOdds: 2.186,
          Status: "Normal",
        },
        {
          SourceBetID: "5561517888837431",
          Map: 1,
          BetName: "[地图1]-单局-获胜",
          SourceHomeID: "5561517888838120",
          HomeOdds: 1.2,
          SourceAwayID: "5561517888838121",
          AwayOdds: 4.338,
          Status: "Normal",
        },
      ],
    },
  };
  const out = buildBetsForMatch("OB", "4272745136855916", 0, bets, src, "cs2");
  assert.equal(out.length, 1);
  assert.equal(out[0].Name, "[地图1]-单局-获胜");
  assert.equal(out[0].Sources.OB.HomeOdds, 1.2);
  assert.equal(out[0].Sources.OB.BetID, "5561517888837431");
});

test("OB CS2 Map1: 单局-获胜 wins over 第二十二回合 when round bet listed first", () => {
  const bets = {
    "OB:1": {
      provider: "OB",
      matchId: "1",
      bets: [
        {
          SourceBetID: "round",
          Map: 1,
          BetName: "[地图1]-第二十二回合获胜",
          SourceHomeID: "h1",
          HomeOdds: 1.546,
          SourceAwayID: "a1",
          AwayOdds: 2.398,
          Status: "Normal",
        },
        {
          SourceBetID: "map",
          Map: 1,
          BetName: "[地图1]-单局-获胜",
          SourceHomeID: "h2",
          HomeOdds: 1.2,
          SourceAwayID: "a2",
          AwayOdds: 4.338,
          Status: "Normal",
        },
      ],
    },
  };
  const out = buildBetsForMatch("OB", "1", 0, bets, src, "cs2");
  assert.equal(out.length, 1);
  assert.equal(out[0].Name, "[地图1]-单局-获胜");
});

test("OB CS2 Map1: odd_type_id match beats name-only rows", () => {
  const bets = {
    "OB:1": {
      provider: "OB",
      matchId: "1",
      bets: [
        {
          SourceBetID: "map",
          Map: 1,
          BetName: "[地图1]-单局-获胜",
          OddTypeID: "258790779782319",
          SourceHomeID: "h1",
          HomeOdds: 1.2,
          SourceAwayID: "a1",
          AwayOdds: 4.3,
          Status: "Normal",
        },
        {
          SourceBetID: "pistol",
          Map: 1,
          BetName: "[地图1]-第一手枪局获胜",
          SourceHomeID: "h2",
          HomeOdds: 1.6,
          SourceAwayID: "a2",
          AwayOdds: 2.1,
          Status: "Normal",
        },
      ],
    },
  };
  const out = buildBetsForMatch("OB", "1", 0, bets, src, "cs2");
  assert.equal(out.length, 1);
  assert.equal(out[0].Sources.OB.BetID, "map");
});
