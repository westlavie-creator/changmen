import { describe, expect, it } from "vitest";
import { buildManualBetPromptMessage } from "@/stores/betting/manualBet";
import type { ViewBet, ViewBetItem, ViewMatch } from "@/models/match";

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
