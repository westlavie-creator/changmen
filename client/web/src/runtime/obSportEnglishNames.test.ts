import { afterEach, describe, expect, it } from "vitest";
import {
  collectObEnglishNames,
  peekObEnglishNames,
  rememberObEnglishNames,
  resetObEnglishNamesForTests,
} from "@/runtime/obSportEnglishNames";

afterEach(() => {
  resetObEnglishNamesForTests();
});

describe("obSportEnglishNames", () => {
  it("reads English mhn/man from the same mid odds row", () => {
    const rows = collectObEnglishNames({
      data: [{
        mid: "5644429",
        mhn: "Necaxa",
        man: "Puebla",
        tnjc: "Mexico Liga MX",
        tn: "Mexico Liga MX",
      }],
    });
    expect(rows.get("5644429")).toEqual({
      home: "Necaxa",
      away: "Puebla",
      league: "Mexico Liga MX",
    });
  });

  it("skips junk 大/小 labels and non-C8 ids", () => {
    const rows = collectObEnglishNames([
      { mid: "5644429", mhn: "Over", man: "Under" },
      { mid: "1234567890123456789", mhn: "Arsenal", man: "Chelsea" },
    ]);
    expect(rows.size).toBe(0);
  });

  it("caches names by mid and prunes off-board keys", () => {
    rememberObEnglishNames(new Map([
      ["5644429", { home: "Necaxa", away: "Puebla", league: "Mexico Liga MX" }],
      ["5652292", { home: "Arsenal", away: "Chelsea", league: "EPL" }],
    ]));
    expect(peekObEnglishNames("5644429")?.home).toBe("Necaxa");
    rememberObEnglishNames(new Map(), ["5652292"]);
    expect(peekObEnglishNames("5644429")).toBeNull();
    expect(peekObEnglishNames("5652292")?.away).toBe("Chelsea");
  });
});
