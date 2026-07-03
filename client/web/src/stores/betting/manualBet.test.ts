import type { ViewBet, ViewBetItem, ViewMatch } from "@/models/match";
import { describe, expect, it } from "vitest";
import { buildManualBetCheckFailureHtml } from "@/stores/betting/manualBetAlert";
import { buildManualBetPromptMessage } from "@/stores/betting/manualBet";

describe("buildManualBetPromptMessage", () => {
  it("uses bet.getBetName for market label (A8 parity)", () => {
    const match = { title: "A vs B", bets: [] } as unknown as ViewMatch;
    const bet = {
      round: 3,
      name: "[地图3]-单局-获胜",
      homeName: "A",
      awayName: "B",
      getBetName: () => "[地图3] 获胜",
      items: [],
    } as unknown as ViewBet;
    const item = { type: "RAY" } as unknown as ViewBetItem;
    const msg = buildManualBetPromptMessage(match, bet, item, "Home", 1.61);
    expect(msg).toContain("盘口：[地图3] 获胜");
    expect(msg).not.toContain("[地图3]-单局-获胜");
  });
});

describe("buildManualBetCheckFailureHtml", () => {
  const match = { title: "G2 Esports vs TES", bets: [] } as unknown as ViewMatch;
  const bet = {
    homeName: "G2",
    awayName: "TES",
    getBetName: () => "[地图2] 获胜",
    items: [],
  } as unknown as ViewBet;
  const item = { type: "Polymarket" } as unknown as ViewBetItem;

  it("includes match context and reason", () => {
    const html = buildManualBetCheckFailureHtml(
      match,
      bet,
      item,
      "Away",
      1.667,
      14,
      "盘口价高于检测价",
    );
    expect(html).toContain("G2 Esports vs TES");
    expect(html).toContain("Polymarket");
    expect(html).toContain("TES @ 1.667");
    expect(html).toContain("金额：14");
    expect(html).toContain("盘口价高于检测价");
    expect(html).toContain("manual-bet-alert__meta");
  });

  it("uses fallback reason when checkError empty", () => {
    const html = buildManualBetCheckFailureHtml(match, bet, item, "Away", 1.667, 14, "");
    expect(html).toContain("场馆未返回可用盘口");
  });
});
