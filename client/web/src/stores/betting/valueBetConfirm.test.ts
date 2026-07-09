import { describe, expect, it } from "vitest";
import { calcEdge, removVig } from "@/extensions/valueBet/evCalc";
import { isValueBetPositiveEdge } from "@/extensions/valueBet/computeValueBetEdge";
import { createValueBetLinkId, formatLinkId, isValueBetLink } from "@/shared/format";
import { buildValueBetConfirmPromptMessage } from "@/stores/betting/valueBetConfirm";

describe("isValueBetPositiveEdge", () => {
  it("requires >= 3%", () => {
    expect(isValueBetPositiveEdge(0.03)).toBe(true);
    expect(isValueBetPositiveEdge(0.029)).toBe(false);
  });
});

describe("edge math for confirm path", () => {
  it("matches soft vs PB fair", () => {
    const fair = removVig(1.9, 1.95)!;
    const edge = calcEdge(2.2, fair.fairHome);
    expect(edge).toBeGreaterThan(0.03);
  });
});

describe("buildValueBetConfirmPromptMessage", () => {
  it("includes edge and fair odds", () => {
    const msg = buildValueBetConfirmPromptMessage(
      { title: "A vs B" } as never,
      { getBetName: () => "全场", homeName: "A", awayName: "B" } as never,
      { type: "RAY" } as never,
      "Home",
      { softOdds: 2.2, fairOdds: 1.95, edge: 0.05 },
    );
    expect(msg).toContain("公允(PB)");
    expect(msg).toContain("+5.0%");
    expect(msg).toContain("非套利");
  });
});

describe("valueBet linkId (scheme B)", () => {
  it("creates 💎 link distinct from 9999", () => {
    const id = createValueBetLinkId(1_780_000_000_000);
    expect(isValueBetLink(id)).toBe(true);
    expect(formatLinkId(id)).toBe("💎");
    expect(formatLinkId(-1_780_000_000_000)).toBe("🏆");
  });
});
