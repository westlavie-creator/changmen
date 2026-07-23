import { describe, expect, it } from "vitest";
import {
  bettingLoadingMessageHtml,
  bettingNotifyAccountLine,
  bettingProviderHeadHtml,
  bettingResultMessageHtml,
} from "./a8Notify";

describe("a8Notify betting head", () => {
  it("prefers venueAccountName over playerName for account line", () => {
    expect(bettingNotifyAccountLine({
      provider: "OB",
      platformName: "好博",
      venueAccountName: "ob_live_01",
      playerName: "old_name",
    }, "好博")).toBe("好博 / ob_live_01");
  });

  it("falls back to playerName when venueAccountName missing", () => {
    expect(bettingNotifyAccountLine({
      provider: "RAY",
      playerName: "ray_user",
    }, "雷竞技")).toBe("雷竞技 / ray_user");
  });

  it("puts provider badge before account line on the first row", () => {
    const html = bettingProviderHeadHtml("OB", "好博 / ob_live_01", "买入中...");
    expect(html.indexOf("provider-icon")).toBeLessThan(html.indexOf("notify-account-line"));
    expect(html).toContain('class="provider-icon OB"');
    expect(html).toContain("好博 / ob_live_01 买入中...");
  });

  it("builds loading/result message with account line", () => {
    expect(bettingLoadingMessageHtml("RAY", "雷竞技 / a1", "<p>detail</p>")).toContain("雷竞技 / a1 买入中...");
    expect(bettingResultMessageHtml("RAY", "雷竞技 / a1", "<p>detail</p>", "", "待确认"))
      .toContain("雷竞技 / a1 待确认");
  });
});
