import { describe, expect, it, vi } from "vitest";
import { createArbFlowTrace, formatArbFlowTelegramBody } from "@/extensions/arbBet/betTrace";
import { isA8StrictMode } from "@/shared/a8Strict";

vi.mock("@/shared/a8Strict", () => ({
  isA8StrictMode: vi.fn(() => false),
}));

const match = { id: "m1", title: "A VS B" } as import("@/models/match").ViewMatch;
const bet = { id: 1, getBetName: () => "全场" } as import("@/models/match").ViewBet;

describe("createArbFlowTrace", () => {
  it("is no-op in strict A8 mode", () => {
    vi.mocked(isA8StrictMode).mockReturnValue(true);
    const trace = createArbFlowTrace(match, bet, { implied: 1.02 });
    trace.event("预检", "x");
    trace.finish("fail", "test");
    expect(trace.id).toBe("");
  });

  it("formats timeline body", () => {
    vi.mocked(isA8StrictMode).mockReturnValue(false);
    const startedAt = Date.now();
    const body = formatArbFlowTelegramBody({
      id: "m1:1:1",
      matchTitle: "A VS B",
      betName: "全场",
      startedAt,
      events: [{ at: startedAt + 1500, stage: "预检", detail: "OB ❌ 封盘" }],
      outcome: "fail",
      summary: "预检未通过",
      meta: { implied: 1.02, homeLine: "RAY@1.9", awayLine: "OB@2.0" },
    });
    expect(body).toContain("套利下单失败");
    expect(body).toContain("预检未通过");
    expect(body).toContain("OB ❌ 封盘");
  });
});
