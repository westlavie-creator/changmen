/**
 * 内存合并冒烟：双场馆同场合并；单源不强制替换 concat。
 */
import assert from "node:assert/strict";
import { encodeSportBetId } from "./sport_football_markets.js";
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

// 足球：同联赛双馆合并；展示全量 moneyline + 全部 spreads/totals 线
const footList = [{
  ID: 100,
  Title: "Alpha vs Beta",
  Game: "ucl",
  StartTime: t,
  Matchs: { Polymarket: "pm-ucl" },
  Bets: [
    {
      Map: 0,
      Name: "全场胜负",
      MarketCode: "moneyline",
      Line: null,
      HomeName: "Alpha",
      AwayName: "Beta",
      Sources: {
        Polymarket: {
          Type: "Polymarket",
          BetID: "pml",
          HomeID: "ph",
          AwayID: "pa",
          HomeOdds: 1.8,
          AwayOdds: 2.2,
          Status: "Normal",
        },
      },
    },
    {
      Map: 0,
      Name: "让球 -1.5",
      MarketCode: "spreads",
      Line: -1.5,
      HomeName: "Alpha",
      AwayName: "Beta",
      Sources: {
        Polymarket: {
          Type: "Polymarket",
          BetID: "ps",
          HomeID: "phs",
          AwayID: "pas",
          HomeOdds: 1.95,
          AwayOdds: 1.95,
          Status: "Normal",
        },
      },
    },
    {
      Map: 0,
      Name: "让球 -2.5",
      MarketCode: "spreads",
      Line: -2.5,
      HomeName: "Alpha",
      AwayName: "Beta",
      Sources: {
        Polymarket: {
          Type: "Polymarket",
          BetID: "ps2",
          HomeID: "phs2",
          AwayID: "pas2",
          HomeOdds: 2.1,
          AwayOdds: 1.8,
          Status: "Normal",
        },
      },
    },
    {
      Map: 0,
      Name: "大小 2.5",
      MarketCode: "totals",
      Line: 2.5,
      HomeName: "大",
      AwayName: "小",
      Sources: {
        Polymarket: {
          Type: "Polymarket",
          BetID: "pt",
          HomeID: "pho",
          AwayID: "pau",
          HomeOdds: 1.9,
          AwayOdds: 1.9,
          Status: "Normal",
        },
      },
    },
    {
      Map: 0,
      Name: "大小 3.5",
      MarketCode: "totals",
      Line: 3.5,
      HomeName: "大",
      AwayName: "小",
      Sources: {
        Polymarket: {
          Type: "Polymarket",
          BetID: "pt2",
          HomeID: "pho2",
          AwayID: "pau2",
          HomeOdds: 2.1,
          AwayOdds: 1.7,
          Status: "Normal",
        },
      },
    },
  ],
}, {
  ID: 101,
  Title: "Alpha vs Beta",
  Game: "ucl",
  StartTime: t,
  Matchs: { PredictFun: "pf-ucl" },
  Bets: [
    {
      Map: 0,
      Name: "全场胜负",
      MarketCode: "moneyline",
      Line: null,
      HomeName: "Alpha",
      AwayName: "Beta",
      Sources: {
        PredictFun: {
          Type: "PredictFun",
          BetID: "pfl",
          HomeID: "fh",
          AwayID: "fa",
          HomeOdds: 1.85,
          AwayOdds: 2.1,
          Status: "Normal",
        },
      },
    },
    {
      Map: 0,
      Name: "让球 -1.5",
      MarketCode: "spreads",
      Line: -1.5,
      HomeName: "Alpha",
      AwayName: "Beta",
      Sources: {
        PredictFun: {
          Type: "PredictFun",
          BetID: "pfs",
          HomeID: "fhs",
          AwayID: "fas",
          HomeOdds: 2.0,
          AwayOdds: 1.8,
          Status: "Normal",
        },
      },
    },
    {
      Map: 0,
      Name: "大小 2.5",
      MarketCode: "totals",
      Line: 2.5,
      HomeName: "大",
      AwayName: "小",
      Sources: {
        PredictFun: {
          Type: "PredictFun",
          BetID: "pft",
          HomeID: "fho",
          AwayID: "fau",
          HomeOdds: 1.88,
          AwayOdds: 1.92,
          Status: "Normal",
        },
      },
    },
  ],
}];
const foot = mergeSportClientMatchDtoList("football", footList);
assert.equal(foot.multiVenueCount, 1);
assert.equal(foot.dtos.length, 1);
assert.equal(foot.dtos[0].Game, "ucl");
assert.equal(foot.dtos[0].Bets.length, 5);
assert.deepEqual(
  foot.dtos[0].Bets.map(b => `${b.MarketCode}:${b.Line ?? ""}`),
  ["moneyline:", "spreads:-2.5", "spreads:-1.5", "totals:2.5", "totals:3.5"],
);
assert.ok(foot.dtos[0].Bets.find(b => b.Line === -1.5)?.Sources.Polymarket
  && foot.dtos[0].Bets.find(b => b.Line === -1.5)?.Sources.PredictFun);
assert.ok(foot.dtos[0].Bets.find(b => b.Line === 2.5)?.Sources.Polymarket
  && foot.dtos[0].Bets.find(b => b.Line === 2.5)?.Sources.PredictFun);

// 队名带 (-1.5) 的伪第二场应与干净队名合并成一场
const handicapDup = [{
  ID: 200,
  Title: "Yunnan Yukun FC vs Shenzhen Xinpengcheng FC",
  Game: "uef",
  StartTime: t,
  Matchs: { Polymarket: "pm-yn" },
  Bets: [{
    Map: 0,
    Name: "全场胜负",
    MarketCode: "moneyline",
    Line: null,
    HomeName: "Yunnan Yukun FC",
    AwayName: "Shenzhen Xinpengcheng FC",
    Sources: {
      Polymarket: {
        Type: "Polymarket", BetID: "a", HomeID: "1", AwayID: "2",
        HomeOdds: 1.8, AwayOdds: 2.0, Status: "Normal",
      },
    },
  }],
}, {
  ID: 201,
  Title: "Yunnan Yukun FC (-1.5) vs Shenzhen Xinpengcheng FC (-1.5)",
  Game: "uef",
  StartTime: t,
  Matchs: { PredictFun: "pf-yn" },
  Bets: [{
    Map: 0,
    Name: "全场胜负",
    MarketCode: "moneyline",
    Line: null,
    HomeName: "Yunnan Yukun FC (-1.5)",
    AwayName: "Shenzhen Xinpengcheng FC (-1.5)",
    Sources: {
      PredictFun: {
        Type: "PredictFun", BetID: "b", HomeID: "3", AwayID: "4",
        HomeOdds: 1.85, AwayOdds: 2.05, Status: "Normal",
      },
    },
  }],
}];
const mergedDup = mergeSportClientMatchDtoList("football", handicapDup);
assert.equal(mergedDup.multiVenueCount, 1);
assert.equal(mergedDup.dtos.length, 1);
assert.equal(mergedDup.dtos[0].Title, "Yunnan Yukun FC vs Shenzhen Xinpengcheng FC");
assert.deepEqual(Object.keys(mergedDup.dtos[0].Matchs).sort(), ["Polymarket", "PredictFun"]);

// 足球：PM chi + PF uef 不再软挂合并（须同 code；未知用 unknown_fb）
const softLeague = [{
  ID: 300,
  Title: "Qingdao Hainiu FC vs Tianjin Jinmen Hu FC",
  Game: "chi",
  StartTime: t,
  Matchs: { Polymarket: "692645" },
  Bets: [{
    Map: 0,
    Name: "全场胜负",
    MarketCode: "moneyline",
    Line: null,
    HomeName: "Qingdao Hainiu FC",
    AwayName: "Tianjin Jinmen Hu FC",
    Sources: {
      Polymarket: {
        Type: "Polymarket", BetID: "pm", HomeID: "1", AwayID: "2",
        HomeOdds: 2.1, AwayOdds: 3.2, Status: "Normal",
      },
    },
  }],
}, {
  ID: 301,
  Title: "Qingdao Hainiu FC vs. Tianjin Jinmen Hu FC",
  Game: "uef",
  StartTime: t,
  Matchs: { PredictFun: "196744" },
  Bets: [{
    Map: 0,
    Name: "全场胜负",
    MarketCode: "moneyline",
    Line: null,
    HomeName: "Qingdao Hainiu FC",
    AwayName: "Tianjin Jinmen Hu FC",
    Sources: {
      PredictFun: {
        Type: "PredictFun", BetID: "pf", HomeID: "3", AwayID: "4",
        HomeOdds: 2.0, AwayOdds: 3.4, Status: "Normal",
      },
    },
  }],
}];
const soft = mergeSportClientMatchDtoList("football", softLeague);
assert.equal(soft.multiVenueCount, 0);
assert.equal(soft.dtos.length, 2);

// 足球：不同真实联赛同队名不得合并（与棒球 mlb/kbo 同构）
const crossFoot = [{
  ID: 400,
  Title: "Alpha FC vs Beta FC",
  Game: "epl",
  StartTime: t,
  Matchs: { Polymarket: "pm-epl" },
  Bets: [{
    Map: 0,
    MarketCode: "moneyline",
    Line: null,
    HomeName: "Alpha FC",
    AwayName: "Beta FC",
    Sources: {
      Polymarket: {
        Type: "Polymarket", BetID: "a", HomeID: "1", AwayID: "2",
        HomeOdds: 1.9, AwayOdds: 2.0, Status: "Normal",
      },
    },
  }],
}, {
  ID: 401,
  Title: "Alpha FC vs Beta FC",
  Game: "ucl",
  StartTime: t,
  Matchs: { PredictFun: "pf-ucl" },
  Bets: [{
    Map: 0,
    MarketCode: "moneyline",
    Line: null,
    HomeName: "Alpha FC",
    AwayName: "Beta FC",
    Sources: {
      PredictFun: {
        Type: "PredictFun", BetID: "b", HomeID: "3", AwayID: "4",
        HomeOdds: 1.85, AwayOdds: 2.05, Status: "Normal",
      },
    },
  }],
}];
const crossF = mergeSportClientMatchDtoList("football", crossFoot);
assert.equal(crossF.multiVenueCount, 0);
assert.equal(crossF.dtos.length, 2);
assert.deepEqual(crossF.dtos.map(d => d.Game).sort(), ["epl", "ucl"]);

// 全量线 ≥11 条时 BetID 不得与邻场撞号
const manyLines = [{
  ID: 500,
  Game: "mls",
  StartTime: t,
  Matchs: { Polymarket: "pm-many" },
  Bets: [
    { Map: 0, MarketCode: "moneyline", Line: null, HomeName: "A", AwayName: "B",
      Sources: { Polymarket: { Type: "Polymarket", BetID: "m", HomeID: "1", AwayID: "2", HomeOdds: 1.9, AwayOdds: 2.0, Status: "Normal" } } },
    ...[-2.5, -1.5, 1.5, 2.5].map(line => ({
      Map: 0, MarketCode: "spreads", Line: line, HomeName: "A", AwayName: "B",
      Sources: { Polymarket: { Type: "Polymarket", BetID: `s${line}`, HomeID: "1", AwayID: "2", HomeOdds: 1.9, AwayOdds: 1.9, Status: "Normal" } },
    })),
    ...[0.5, 1.5, 2.5, 3.5, 4.5, 5.5].map(line => ({
      Map: 0, MarketCode: "totals", Line: line, HomeName: "大", AwayName: "小",
      Sources: { Polymarket: { Type: "Polymarket", BetID: `t${line}`, HomeID: "1", AwayID: "2", HomeOdds: 1.9, AwayOdds: 1.9, Status: "Normal" } },
    })),
  ],
}];
const many = mergeSportClientMatchDtoList("football", manyLines);
assert.ok(many.dtos[0].Bets.length >= 11);
const ids = many.dtos[0].Bets.map(b => b.ID);
assert.equal(new Set(ids).size, ids.length);
const matchId = many.dtos[0].ID;
assert.equal(ids[0], encodeSportBetId(matchId, 1));
assert.equal(ids[10], encodeSportBetId(matchId, 11));
assert.notEqual(encodeSportBetId(matchId, 11), encodeSportBetId(matchId + 1, 1));

console.log("sport_merge.smoke: ok");
