import { describe, expect, it } from "vitest";
import { ViewBet, type ViewMatch } from "@/models/match";
import type { BetRowDto } from "@/types/esport";
import { createDefaultUserConfig } from "@/types/userConfig";
import { describeGetOrderOptionsSkip } from "@/extensions/notify/describeArbPrepareSkip";

function makeBet(sources: BetRowDto["Sources"]) {
  const row: BetRowDto = {
    ID: 1,
    MatchID: 100,
    HomeID: 1,
    AwayID: 2,
    HomeName: "A",
    AwayName: "B",
    Name: "",
    Map: 0,
    Sources: sources,
  };
  return new ViewBet(row, { PB: "m1", RAY: "m2" }, 0, 0);
}

const match = { id: 100, title: "A vs B", game: "英雄联盟" } as ViewMatch;

describe("describeGetOrderOptionsSkip", () => {
  it("explains missing provider platforms", () => {
    const config = createDefaultUserConfig();
    expect(
      describeGetOrderOptionsSkip(makeBet({}), match, config, [], []),
    ).toContain("无余额");
  });

  it("explains single provider", () => {
    const config = createDefaultUserConfig();
    expect(
      describeGetOrderOptionsSkip(makeBet({}), match, config, ["PB"], []),
    ).toContain("仅 PB");
  });
});
