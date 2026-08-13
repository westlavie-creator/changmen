import { describe, expect, it } from "vitest";
import { parseMatchHomeAway, resolveOrderItemLabel } from "./orderItemDisplay";

describe("parseMatchHomeAway", () => {
  it("parses plain vs titles", () => {
    expect(parseMatchHomeAway("KT Challengers vs NS Esports Academy")).toEqual({
      home: "KT Challengers",
      away: "NS Esports Academy",
    });
  });

  it("strips sport prefix and map suffix", () => {
    expect(parseMatchHomeAway("LoL: A vs B - Game 2 Winner")).toEqual({
      home: "A",
      away: "B",
    });
  });

  it("parses dashed VS titles used by some bookies", () => {
    expect(parseMatchHomeAway("SEN Otters - VS - HIMMERS")).toEqual({
      home: "SEN Otters",
      away: "HIMMERS",
    });
  });

  it("returns null when not a two-side match", () => {
    expect(parseMatchHomeAway("solo market")).toBeNull();
  });
});

describe("resolveOrderItemLabel", () => {
  it("maps Home/Away to team names", () => {
    const match = "KT Challengers vs NS Esports Academy";
    expect(resolveOrderItemLabel("Home", match)).toBe("KT Challengers");
    expect(resolveOrderItemLabel("Away", match)).toBe("NS Esports Academy");
    expect(resolveOrderItemLabel("away", match)).toBe("NS Esports Academy");
  });

  it("maps 平仓 Home/Away", () => {
    expect(resolveOrderItemLabel("平仓 Home", "A vs B")).toBe("平仓 A");
    expect(resolveOrderItemLabel("平仓 Away", "A vs B")).toBe("平仓 B");
  });

  it("keeps real team names", () => {
    expect(resolveOrderItemLabel("Natus Vincere", "TH vs NAVI")).toBe("Natus Vincere");
  });

  it("falls back when match cannot be parsed", () => {
    expect(resolveOrderItemLabel("Away", "")).toBe("Away");
  });
});
