import { describe, expect, it } from "vitest";
import { buildManualBetPromptMessage } from "@/stores/betting/manualBet";
import type { ViewBet, ViewBetItem, ViewMatch } from "@/models/match";

describe("buildManualBetPromptMessage", () => {
  it("shows match title, market line, platform and picked side", () => {
    const match = { title: "Team A vs Team B" } as ViewMatch;
    const bet = {
      name: "[地图3]-单局-获胜",
      homeName: "Team A",
      awayName: "Team B",
      getBetName: () => "[地图3] 获胜",
    } as ViewBet;
    const item = { type: "OB" } as ViewBetItem;
    const msg = buildManualBetPromptMessage(match, bet, item, "Home", 2.586);
    expect(msg).toContain("Team A vs Team B");
    expect(msg).toContain("盘口：[地图3]-单局-获胜");
    expect(msg).toContain("平台：OB");
    expect(msg).toContain("选项：Team A @ 2.586");
    expect(msg).toContain("请输入要投注的金额");
  });
});
