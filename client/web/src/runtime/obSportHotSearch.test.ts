import { describe, expect, it } from "vitest";
import {
  extractObSportSearchKeyword,
  parseObSportHotSearch,
} from "@/runtime/obSportHotSearch";

describe("obSportHotSearch", () => {
  it("extracts the longest latin word like AutoYabo", () => {
    expect(extractObSportSearchKeyword("Manchester United")).toBe("Manchester");
    expect(extractObSportSearchKeyword("Club Deportivo Olimpia")).toBe("Olimpia");
    expect(extractObSportSearchKeyword("Ajax")).toBe("Ajax");
  });

  it("parses teamH5 football rows and skips other sports", () => {
    const rows = parseObSportHotSearch({
      code: "0000000",
      data: {
        teamH5: [
          { mid: "5652292", mhn: "Arsenal", man: "Chelsea", tn: "英超", tid: "82", mgt: "1800000000000", csid: "1" },
          { mid: "99", mhn: "Lakers", man: "Celtics", tn: "NBA", csid: "2", mgt: "1800000000000" },
          { mid: "x", mhn: "A", man: "B" },
        ],
      },
    });
    expect(rows).toEqual([{
      mid: "5652292",
      home: "Arsenal",
      away: "Chelsea",
      league: "英超",
      tid: "82",
      startTime: 1_800_000_000_000,
    }]);
  });
});
