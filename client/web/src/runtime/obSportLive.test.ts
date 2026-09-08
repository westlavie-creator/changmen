import { describe, expect, it } from "vitest";
import {
  formatObSportElapsed,
  formatObSportScore,
  mergeObSportLivePatch,
  obSportPeriodLabel,
  parseMscScore,
  parseObSportHandicapPlay,
  parseObSportMatchLive,
} from "@/runtime/obSportLive";

describe("obSportLive", () => {
  it("reads S0 score from C103 msc", () => {
    expect(parseMscScore(["S1|1:0", "S0|3:1", "S8|4:2"])).toEqual({ home: 3, away: 1 });
    expect(parseObSportMatchLive({
      cmd: "C103",
      cd: { mid: "m1", mpid: "7", msc: ["S0|2:0"] },
    })).toEqual({ mid: "m1", home: 2, away: 0, mmp: "7" });
  });

  it("reads C102 clock and period", () => {
    expect(parseObSportMatchLive({
      cmd: "C102",
      cd: { mid: "m1", mmp: "6", mst: 2781, cmec: "kick_off" },
    })).toEqual({ mid: "m1", ms: 1, mmp: "6", elapsedSec: 2781 });
    expect(obSportPeriodLabel("6")).toBe("上半场");
    expect(obSportPeriodLabel("7")).toBe("下半场");
  });

  it("does not treat C105 quotes as match-live (odds stay in sportOddsStore)", () => {
    expect(parseObSportMatchLive({
      cmd: "C105",
      cd: { mid: "m1", hls: [{ ol: [{ oid: "1", ov: 190000 }] }] },
    })).toBeNull();
  });

  it("treats football C302 as kickoff", () => {
    expect(parseObSportMatchLive({
      cmd: "C302",
      cd: { mid: "m2", csid: "1" },
    })).toEqual({ mid: "m2", ms: 1, refreshList: true });
    expect(parseObSportMatchLive({
      cmd: "C302",
      cd: { mid: "m3", csid: "2" },
    })).toBeNull();
  });

  it("reads C109 match status and C303 play change", () => {
    expect(parseObSportMatchLive({
      cmd: "C109",
      cd: [{ csid: "1", hs: 0, mid: "m9", ms: "110" }],
    })).toEqual({ mid: "m9", ms: 110 });
    expect(parseObSportHandicapPlay({
      cmd: "C303",
      cd: { csid: "1", hpid: "2,4", mid: "m1" },
    })).toEqual({ mid: "m1", hpid: "2,4" });
  });

  it("merges patches and formats score/clock", () => {
    const a = mergeObSportLivePatch(undefined, { mid: "m1", home: 1, away: 0, mmp: "6", elapsedSec: 60, ms: 1 }, 1000);
    const b = mergeObSportLivePatch(a, { mid: "m1", home: 2, away: 0 }, 1000);
    expect(formatObSportScore(b)).toBe("2 - 0");
    expect(formatObSportElapsed(b, 1000)).toBe("1:00");
    expect(formatObSportElapsed(b, 4000)).toBe("1:03");
  });
});
