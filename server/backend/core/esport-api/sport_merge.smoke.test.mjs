/**
 * 内存合并冒烟：双场馆同场合并；单源不强制替换 concat。
 */
import assert from "node:assert/strict";
import { mergeSportClientMatchDtoList } from "./sport_merge.js";

const t = 1_700_000_000_000;
const list = [{
  ID: 1,
  Title: "Yankees vs Red Sox",
  Game: "mlb",
  StartTime: t,
  Matchs: { Polymarket: "pm1" },
  Bets: [{
    ID: 11,
    Map: 0,
    Name: "Moneyline",
    HomeName: "Yankees",
    AwayName: "Red Sox",
    Sources: {
      Polymarket: {
        Type: "Polymarket",
        BetID: "b1",
        HomeID: "h1",
        AwayID: "a1",
        HomeOdds: 1.9,
        AwayOdds: 2.1,
        Status: "Normal",
      },
    },
  }],
}, {
  ID: 2,
  Title: "Yankees vs Red Sox",
  Game: "mlb",
  StartTime: t,
  Matchs: { PredictFun: "pf1" },
  Bets: [{
    ID: 22,
    Map: 0,
    Name: "Moneyline",
    HomeName: "Red Sox",
    AwayName: "Yankees",
    Sources: {
      PredictFun: {
        Type: "PredictFun",
        BetID: "b2",
        HomeID: "h2",
        AwayID: "a2",
        HomeOdds: 2.0,
        AwayOdds: 1.8,
        Status: "Normal",
      },
    },
  }],
}];

const { dtos, multiVenueCount } = mergeSportClientMatchDtoList("baseball", list);
assert.equal(multiVenueCount, 1);
assert.equal(dtos.length, 1);
assert.deepEqual(Object.keys(dtos[0].Matchs).sort(), ["Polymarket", "PredictFun"]);
// 锚点 Polymarket：Yankees home；PF 主客对调后 HomeOdds 应为原 Away 1.8
assert.equal(dtos[0].Bets[0].HomeName, "Yankees");
assert.equal(dtos[0].Bets[0].Sources.PredictFun.HomeOdds, 1.8);
assert.equal(dtos[0].Bets[0].Sources.PredictFun.AwayOdds, 2.0);

// 别名：A's = Athletics
const aliasList = [{
  ID: 3,
  Game: "mlb",
  StartTime: t,
  Matchs: { Polymarket: "pm2" },
  Bets: [{
    Map: 0,
    HomeName: "A's",
    AwayName: "Yankees",
    Sources: {
      Polymarket: {
        Type: "Polymarket",
        BetID: "b3",
        HomeID: "h3",
        AwayID: "a3",
        HomeOdds: 2.2,
        AwayOdds: 1.7,
        Status: "Normal",
      },
    },
  }],
}, {
  ID: 4,
  Game: "mlb",
  StartTime: t,
  Matchs: { PredictFun: "pf2" },
  Bets: [{
    Map: 0,
    HomeName: "Yankees",
    AwayName: "Oakland Athletics",
    Sources: {
      PredictFun: {
        Type: "PredictFun",
        BetID: "b4",
        HomeID: "h4",
        AwayID: "a4",
        HomeOdds: 1.75,
        AwayOdds: 2.15,
        Status: "Normal",
      },
    },
  }],
}];
const aliasMerged = mergeSportClientMatchDtoList("baseball", aliasList);
assert.equal(aliasMerged.multiVenueCount, 1);
assert.equal(aliasMerged.dtos.length, 1);

const solo = mergeSportClientMatchDtoList("baseball", [list[0]]);
assert.equal(solo.multiVenueCount, 0);

console.log("sport_merge.smoke: ok");
