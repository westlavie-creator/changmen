import type { CollectBetDto, CollectMatchDto } from "@changmen/client-core/types/collect";
import { describe, expect, it } from "vitest";
import { toA8LiveTimerRow, toA8SaveBetRow, toA8SaveMatchRow } from "./collectWire";

describe("collectWire A8 parity", () => {
  it("toA8SaveMatchRow strips extra top-level fields", () => {
    const row = toA8SaveMatchRow({
      Type: "RAY",
      SourceMatchID: 1,
      SourceGameID: 70,
      StartTime: 1000,
      HomeID: "h",
      Home: "A",
      AwayID: "a",
      Away: "B",
      BO: 3,
      Teams: [{ Type: "RAY", TeamID: "h", Name: "A", GameID: 70, Logo: "/x.png" }],
      Bets: [], // intentional extra field from sloppy caller
    } as CollectMatchDto & { Bets: unknown[] });

    expect(Object.keys(row).sort()).toEqual([
      "Away",
      "AwayID",
      "BO",
      "Home",
      "HomeID",
      "SourceGameID",
      "SourceMatchID",
      "StartTime",
      "Teams",
      "Type",
    ]);

    expect(toA8SaveMatchRow({
      Type: "OB",
      SourceMatchID: 1,
      SourceGameID: 70,
      StartTime: 1000,
      HomeID: "h",
      Home: "A",
      AwayID: "a",
      Away: "B",
      BO: 3,
      IsLive: 2,
      Teams: [{ Type: "OB", TeamID: "h", Name: "A", GameID: 70, Logo: "" }],
    }).IsLive).toBe(2);
    expect(row.Teams[0]).toEqual({
      Type: "RAY",
      TeamID: "h",
      Name: "A",
      GameID: 70,
      Logo: "/x.png",
    });
  });

  it("toA8SaveBetRow drops changmen-only extensions", () => {
    const row = toA8SaveBetRow({
      Type: "OB",
      SourceMatchID: "m1",
      Map: 0,
      SourceBetID: "b1",
      BetName: "[全场]-获胜",
      SourceHomeID: "h1",
      HomeName: "A",
      HomeOdds: 1.9,
      SourceAwayID: "a1",
      AwayName: "B",
      AwayOdds: 2.1,
      Status: "Normal",
      GroupName: "获胜者",
      OddTypeID: "123",
    } as CollectBetDto & { GroupName?: string; OddTypeID?: string });

    expect(row).toEqual({
      Type: "OB",
      SourceMatchID: "m1",
      Map: 0,
      SourceBetID: "b1",
      BetName: "[全场]-获胜",
      SourceHomeID: "h1",
      HomeName: "A",
      HomeOdds: 1.9,
      SourceAwayID: "a1",
      AwayName: "B",
      AwayOdds: 2.1,
      Status: "Normal",
    });
  });

  it("toA8LiveTimerRow keeps three timer fields", () => {
    expect(
      toA8LiveTimerRow({ MatchID: 9, Round: 2, StartTime: 123456 }),
    ).toEqual({ MatchID: 9, Round: 2, StartTime: 123456 });
  });
});
