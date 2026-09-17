import { beforeEach, describe, expect, it } from "vitest";
import {
  collectObChineseNames,
  peekObChineseNames,
  rememberObChineseNames,
  resetObChineseNamesForTests,
} from "@/runtime/obSportChineseNames";

beforeEach(() => {
  resetObChineseNamesForTests();
});

describe("obSportChineseNames", () => {
  it("reads Chinese mhn/man from the same mid odds row", () => {
    const rows = collectObChineseNames({
      data: [{
        mid: "5652292",
        mhn: "阿森纳",
        man: "切尔西",
        tnjc: "英超",
      }],
    });
    expect(rows.get("5652292")).toEqual({
      home: "阿森纳",
      away: "切尔西",
      league: "英超",
    });
  });

  it("skips junk outcome labels", () => {
    const rows = collectObChineseNames([
      { mid: "1", mhn: "大", man: "小" },
      { mid: "5652292", mhn: "阿森纳", man: "切尔西" },
    ]);
    expect(rows.has("1")).toBe(false);
    expect(rows.get("5652292")?.home).toBe("阿森纳");
  });

  it("remembers and prunes by keepMids", () => {
    rememberObChineseNames(new Map([
      ["5644429", { home: "内卡萨", away: "美洲", league: "" }],
      ["5652292", { home: "阿森纳", away: "切尔西", league: "英超" }],
    ]));
    expect(peekObChineseNames("5644429")?.home).toBe("内卡萨");
    rememberObChineseNames(new Map(), ["5652292"]);
    expect(peekObChineseNames("5644429")).toBeNull();
    expect(peekObChineseNames("5652292")?.away).toBe("切尔西");
  });
});
