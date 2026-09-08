import { describe, expect, it } from "vitest";
import {
  FOOTBALL_BOOK_COLUMNS,
  footballRowKind,
  formatFootballLine,
  groupFootballBook,
  groupFootballColumns,
  splitFootballTeams,
} from "@/runtime/footballMarketLayout";
import type { FootballObMarketRow } from "@/runtime/footballObMarkets";

function row(partial: FootballObMarketRow): FootballObMarketRow {
  return {
    Selections: [
      { Name: "主", Side: "home", Odds: 1.9 },
      { Name: "客", Side: "away", Odds: 1.9 },
    ],
    ...partial,
  };
}

describe("footballMarketLayout", () => {
  it("splits match title teams", () => {
    expect(splitFootballTeams("卡利亚里 vs 莱切")).toEqual({ home: "卡利亚里", away: "莱切" });
  });

  it("formats signed handicap lines", () => {
    expect(formatFootballLine(-0.5)).toBe("-0.5");
    expect(formatFootballLine(0.5)).toBe("+0.5");
  });

  it("exposes left-to-right category columns", () => {
    expect(FOOTBALL_BOOK_COLUMNS.map(t => t.label)).toEqual([
      "全场让球",
      "全场大小",
      "半场让球",
      "半场大小",
    ]);
  });

  it("classifies by OB hpid, not by whether the 独赢 line has hv", () => {
    expect(footballRowKind({
      Name: "全场独赢",
      MarketCode: "moneyline",
      Line: -1,
      hpid: "1",
      Selections: [
        { Name: "主胜", Side: "home", Odds: 4.7 },
        { Name: "平", Side: "draw", Odds: 1.27 },
        { Name: "客胜", Side: "away", Odds: 8 },
      ],
    })).toBe("ml");
    expect(footballRowKind({
      Name: "全场让球",
      MarketCode: "spreads",
      Line: -0.5,
      hpid: "4",
      Selections: [
        { Name: "主", Side: "home", Odds: 1.9 },
        { Name: "客", Side: "away", Odds: 1.9 },
      ],
    })).toBe("ah");
  });

  it("groups 让球 lines into one 全场让球 section, 独赢 first", () => {
    const rows = [
      row({ Name: "全场让球", MarketCode: "spreads", Line: -0.5, hpid: "4" }),
      row({ Name: "全场让球", MarketCode: "spreads", Line: -1, hpid: "4" }),
      row({
        Name: "全场独赢",
        MarketCode: "moneyline",
        Line: null,
        hpid: "1",
        Selections: [
          { Name: "主胜", Side: "home", Odds: 2.1 },
          { Name: "平", Side: "draw", Odds: 3.2 },
          { Name: "客胜", Side: "away", Odds: 3.4 },
        ],
      }),
    ];
    const hot = groupFootballBook(rows, "hot");
    expect(hot.map(s => s.title)).toEqual(["全场独赢", "全场让球"]);
    expect(hot.find(s => s.kind === "ah")?.rows).toHaveLength(2);
    expect(footballRowKind(rows[0])).toBe("ah");
  });

  it("caps compact 让球 lines at 3 nearest to even", () => {
    const rows = [-2, -1.5, -1, -0.5, 0, 0.5].map((line, i) =>
      row({ Name: "全场让球", MarketCode: "spreads", Line: line, hpid: `4-${i}` }),
    );
    const hot = groupFootballBook(rows, "hot");
    expect(hot[0]?.rows.map(r => r.Line)).toEqual([-0.5, 0, 0.5]);
    expect(groupFootballBook(rows, "ahou")[0]?.rows).toHaveLength(6);
  });

  it("puts 反波胆 in 波胆 tab, not 热门", () => {
    const rows = [
      row({
        Name: "全场反波胆",
        MarketCode: "ob:7",
        hpid: "7",
        Selections: [
          { Name: "1-0", Side: "other", Odds: 1.02 },
          { Name: "2-0", Side: "other", Odds: 1.03 },
        ],
      }),
    ];
    expect(groupFootballBook(rows, "hot")).toHaveLength(0);
    expect(groupFootballBook(rows, "cs")[0]?.title).toMatch(/反波胆/);
    expect(groupFootballBook(rows, "all")).toHaveLength(1);
  });

  it("lays out 全场/半场 让球/大小 as four columns", () => {
    const rows = [
      row({
        Name: "全场独赢",
        MarketCode: "moneyline",
        Line: null,
        hpid: "1",
        Selections: [
          { Name: "主胜", Side: "home", Odds: 2.1 },
          { Name: "平", Side: "draw", Odds: 3.2 },
          { Name: "客胜", Side: "away", Odds: 3.4 },
        ],
      }),
      row({ Name: "全场让球", MarketCode: "spreads", Line: -0.5, hpid: "4" }),
      row({
        Name: "全场大小",
        MarketCode: "totals",
        Line: 2.5,
        hpid: "2",
        Selections: [
          { Name: "大", Side: "over", Odds: 1.85 },
          { Name: "小", Side: "under", Odds: 1.95 },
        ],
      }),
      row({ Name: "半场让球", MarketCode: "ht_spreads", Line: -0.25, hpid: "19" }),
      row({
        Name: "半场大小",
        MarketCode: "ht_totals",
        Line: 1.5,
        hpid: "18",
        Selections: [
          { Name: "大", Side: "over", Odds: 1.9 },
          { Name: "小", Side: "under", Odds: 1.9 },
        ],
      }),
      row({
        Name: "全场反波胆",
        MarketCode: "ob:7",
        hpid: "7",
        Selections: [
          { Name: "1-0", Side: "other", Odds: 1.02 },
          { Name: "2-0", Side: "other", Odds: 1.03 },
        ],
      }),
    ];
    const cols = groupFootballColumns(rows);
    expect(cols.map(c => c.label)).toEqual(["全场让球", "全场大小", "半场让球", "半场大小"]);
    expect(cols.map(c => c.sections[0]?.title)).toEqual(["全场让球", "全场大小", "半场让球", "半场大小"]);
    expect(cols.find(c => c.id === "ah")?.sections[0]?.rows).toHaveLength(1);
    expect(cols.find(c => c.id === "ht_ah")?.sections[0]?.rows[0]?.hpid).toBe("19");
  });

  it("keeps four columns when 半场 is empty", () => {
    const cols = groupFootballColumns([
      row({ Name: "全场让球", MarketCode: "spreads", Line: -0.5, hpid: "4" }),
    ]);
    expect(cols.map(c => c.id)).toEqual(["ah", "ou", "ht_ah", "ht_ou"]);
    expect(cols.find(c => c.id === "ht_ah")?.sections).toEqual([]);
    expect(cols.find(c => c.id === "ou")?.sections).toEqual([]);
  });

  it("puts hpid 19 in 半场让球 even if the name has no 半场", () => {
    const cols = groupFootballColumns([
      row({ Name: "让球", MarketCode: "spreads", Line: -0.25, hpid: "19" }),
    ]);
    expect(cols.find(c => c.id === "ht_ah")?.sections[0]?.rows[0]?.hpid).toBe("19");
    expect(cols.find(c => c.id === "ah")?.sections).toEqual([]);
  });

  it("does not show 独赢 rows in the book", () => {
    const rows = [
      row({
        Name: "全场独赢",
        MarketCode: "moneyline",
        Line: null,
        Selections: [
          { Name: "主胜", Side: "home", Odds: 1.94 },
          { Name: "平", Side: "draw", Odds: 3 },
          { Name: "客胜", Side: "away", Odds: 3.7 },
        ],
      }),
      row({
        Name: "全场独赢",
        MarketCode: "moneyline",
        Line: 0,
        Selections: [
          { Name: "平", Side: "draw", Odds: 5.2 },
        ],
      }),
    ];
    expect(groupFootballColumns(rows)).toEqual([]);
  });

  it("does not show hpid-1 独赢 in 让球 or any column", () => {
    const rows = [
      row({
        Name: "全场独赢",
        MarketCode: "moneyline",
        Line: null,
        hpid: "1",
        Selections: [
          { Name: "主胜", Side: "home", Odds: 2.05 },
          { Name: "平", Side: "draw", Odds: 3.4 },
          { Name: "客胜", Side: "away", Odds: 3.2 },
        ],
      }),
      row({
        Name: "全场独赢",
        MarketCode: "moneyline",
        Line: -1,
        hpid: "1",
        Selections: [
          { Name: "主胜", Side: "home", Odds: 5.8 },
          { Name: "平", Side: "draw", Odds: 1.2 },
          { Name: "客胜", Side: "away", Odds: 8.1 },
        ],
      }),
      row({
        Name: "全场独赢",
        MarketCode: "moneyline",
        Line: -2,
        hpid: "1",
        Selections: [
          { Name: "主胜", Side: "home", Odds: 5 },
          { Name: "平", Side: "draw", Odds: 1.28 },
          { Name: "客胜", Side: "away", Odds: 6.9 },
        ],
      }),
    ];
    const cols = groupFootballColumns(rows);
    expect(cols.find(c => c.id === "ml")).toBeUndefined();
    expect(cols.find(c => c.id === "ah")).toBeUndefined();
    expect(cols).toEqual([]);
  });

  it("puts 双方都进球 in 进球, not 热门", () => {
    const rows = [
      row({
        Name: "双方都进球",
        MarketCode: "ob:12",
        hpid: "12",
        Selections: [
          { Name: "是", Side: "other", Odds: 1.7 },
          { Name: "否", Side: "other", Odds: 2.1 },
        ],
      }),
    ];
    expect(groupFootballBook(rows, "hot")).toHaveLength(0);
    expect(groupFootballBook(rows, "goals")[0]?.title).toMatch(/双方/);
  });
});
