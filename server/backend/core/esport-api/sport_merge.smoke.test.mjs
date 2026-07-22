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

// 翻转时 HomeMarketID/AwayMarketID 也要互换（体育 WS 订阅）
const listWithMkt = [{
  ID: 10,
  Title: "Yankees vs Red Sox",
  Game: "mlb",
  StartTime: t,
  Matchs: { Polymarket: "pm1" },
  Bets: [{
    Map: 0,
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
  ID: 11,
  Title: "Yankees vs Red Sox",
  Game: "mlb",
  StartTime: t,
  Matchs: { PredictFun: "pf1" },
  Bets: [{
    Map: 0,
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
        HomeMarketID: "mkt-redsox",
        AwayMarketID: "mkt-yankees",
      },
    },
  }],
}];
const withMkt = mergeSportClientMatchDtoList("baseball", listWithMkt);
assert.equal(withMkt.dtos[0].Bets[0].Sources.PredictFun.HomeMarketID, "mkt-yankees");
assert.equal(withMkt.dtos[0].Bets[0].Sources.PredictFun.AwayMarketID, "mkt-redsox");

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

// 同队名不同联赛（Game）不得合并 — 与电竞 cs2/lol 隔离同构
const crossLeague = [{
  ID: 5,
  Game: "mlb",
  StartTime: t,
  Matchs: { Polymarket: "pm-mlb" },
  Bets: [{
    Map: 0,
    HomeName: "Lions",
    AwayName: "Twins",
    Sources: {
      Polymarket: {
        Type: "Polymarket",
        BetID: "b5",
        HomeID: "h5",
        AwayID: "a5",
        HomeOdds: 1.9,
        AwayOdds: 2.0,
        Status: "Normal",
      },
    },
  }],
}, {
  ID: 6,
  Game: "kbo",
  StartTime: t,
  Matchs: { PredictFun: "pf-kbo" },
  Bets: [{
    Map: 0,
    HomeName: "Lions",
    AwayName: "Twins",
    Sources: {
      PredictFun: {
        Type: "PredictFun",
        BetID: "b6",
        HomeID: "h6",
        AwayID: "a6",
        HomeOdds: 1.85,
        AwayOdds: 2.05,
        Status: "Normal",
      },
    },
  }],
}];
const cross = mergeSportClientMatchDtoList("baseball", crossLeague);
assert.equal(cross.multiVenueCount, 0);
assert.equal(cross.dtos.length, 2);
assert.deepEqual(cross.dtos.map(d => d.Game).sort(), ["kbo", "mlb"]);

const sameKbo = [{
  ID: 7,
  Game: "kbo",
  StartTime: t,
  Matchs: { Polymarket: "pm-kbo" },
  Bets: [{
    Map: 0,
    HomeName: "NC Dinos",
    AwayName: "LG Twins",
    Sources: {
      Polymarket: {
        Type: "Polymarket",
        BetID: "b7",
        HomeID: "h7",
        AwayID: "a7",
        HomeOdds: 1.9,
        AwayOdds: 2.0,
        Status: "Normal",
      },
    },
  }],
}, {
  ID: 8,
  Game: "kbo",
  StartTime: t,
  Matchs: { PredictFun: "pf-kbo2" },
  Bets: [{
    Map: 0,
    HomeName: "LG Twins",
    AwayName: "NC Dinos",
    Sources: {
      PredictFun: {
        Type: "PredictFun",
        BetID: "b8",
        HomeID: "h8",
        AwayID: "a8",
        HomeOdds: 2.0,
        AwayOdds: 1.9,
        Status: "Normal",
      },
    },
  }],
}];
const kboMerged = mergeSportClientMatchDtoList("baseball", sameKbo);
assert.equal(kboMerged.multiVenueCount, 1);
assert.equal(kboMerged.dtos.length, 1);
assert.equal(kboMerged.dtos[0].Game, "kbo");

console.log("sport_merge.smoke: ok");
