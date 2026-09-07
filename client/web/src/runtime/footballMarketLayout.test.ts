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
      "独赢",
      "让球",
      "大小",
      "半场",
      "进球",
      "波胆",
      "角球",
      "其他",
    ]);
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

  it("lays out 独赢 / 让球 / 波胆 as left-to-right columns", () => {
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
        Name: "全场反波胆",
        MarketCode: "ob:7",
        hpid: "7",
        Selections: [
          { Name: "1-0", Side: "other", Odds: 1.02 },
          { Name: "2-0", Side: "other", Odds: 1.03 },
        ],
      }),
    ];
    expect(groupFootballColumns(rows).map(c => c.label)).toEqual(["独赢", "让球", "波胆"]);
  });

  it("does not put a draw-only OB line into 独赢", () => {
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
    const ml = groupFootballColumns(rows).find(c => c.id === "ml");
    expect(ml?.sections[0]?.rows).toHaveLength(1);
    expect(ml?.sections[0]?.rows[0]?.Selections?.find(s => s.Side === "draw")?.Odds).toBe(3);
  });

  it("keeps hpid-1 handicap lines in 独赢 and labels each hv", () => {
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
    const ml = cols.find(c => c.id === "ml");
    expect(cols.find(c => c.id === "ah")).toBeUndefined();
    expect(ml?.sections).toHaveLength(1);
    expect(ml?.sections[0]?.title).toBe("全场独赢");
    expect(ml?.sections[0]?.rows.map(r => r.Line)).toEqual([-2, -1, null]);
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
