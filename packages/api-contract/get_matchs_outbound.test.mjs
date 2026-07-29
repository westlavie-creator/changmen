import assert from "node:assert/strict";
import { afterEach, describe, it } from "vitest";
import {
  __resetGetMatchsOutboundWarnStatsForTests,
  getGetMatchsOutboundWarnStats,
  warnClientGetMatchsOutbound,
} from "./src/schemas.ts";

afterEach(() => {
  __resetGetMatchsOutboundWarnStatsForTests();
});

function pfMatch({ homeMarket = "111", awayMarket = "222" } = {}) {
  return {
    ID: 42,
    Title: "A vs B",
    Bets: [{
      Map: 0,
      Sources: {
        PredictFun: {
          Type: "PredictFun",
          BetID: "b1",
          HomeID: "h",
          AwayID: "a",
          HomeOdds: 1.5,
          AwayOdds: 2.5,
          HomeMarketID: homeMarket,
          AwayMarketID: awayMarket,
        },
        OB: {
          Type: "OB",
          BetID: "ob1",
          HomeID: "1",
          AwayID: "2",
          HomeOdds: 1.4,
          AwayOdds: 2.6,
        },
      },
    }],
  };
}

describe("warnClientGetMatchsOutbound", () => {
  it("passes when PF Sources have MarketIDs", () => {
    const r = warnClientGetMatchsOutbound([pfMatch()]);
    assert.equal(r.ok, true);
    assert.equal(r.pfSourceCount, 1);
    assert.equal(r.issues.length, 0);
    assert.equal(getGetMatchsOutboundWarnStats().issueEvents, 0);
  });

  it("warns when PF HomeMarketID missing", () => {
    const r = warnClientGetMatchsOutbound([pfMatch({ homeMarket: "" })]);
    assert.equal(r.ok, false);
    assert.match(r.issues[0], /HomeMarketID/);
    assert.equal(getGetMatchsOutboundWarnStats().issueEvents, 1);
  });

  it("warns when PF AwayMarketID missing", () => {
    const r = warnClientGetMatchsOutbound([pfMatch({ awayMarket: "  " })]);
    assert.equal(r.ok, false);
    assert.match(r.issues.join(" "), /AwayMarketID/);
  });

  it("detects PF by Type even if key is odd", () => {
    const list = [{
      ID: 1,
      Bets: [{
        Sources: {
          other: {
            Type: "PredictFun",
            HomeID: "h",
            AwayID: "a",
          },
        },
      }],
    }];
    const r = warnClientGetMatchsOutbound(list);
    assert.equal(r.ok, false);
    assert.equal(r.pfSourceCount, 1);
    assert.match(r.issues[0], /HomeMarketID/);
  });

  it("ignores non-PF sources without MarketID", () => {
    const r = warnClientGetMatchsOutbound([{
      ID: 9,
      Bets: [{
        Sources: {
          OB: { Type: "OB", HomeID: "1", AwayID: "2", HomeOdds: 1, AwayOdds: 2 },
        },
      }],
    }]);
    assert.equal(r.ok, true);
    assert.equal(r.pfSourceCount, 0);
  });

  it("rejects non-array list shape", () => {
    const r = warnClientGetMatchsOutbound({ not: "list" });
    assert.equal(r.ok, false);
    assert.match(r.issues[0], /list_shape/);
  });
});
