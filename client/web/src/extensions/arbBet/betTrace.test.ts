import { beforeEach, describe, expect, it, vi } from "vitest";
import { createArbFlowTrace, formatArbFlowTelegramBody } from "@/extensions/arbBet/betTrace";
import { isA8StrictMode } from "@/shared/a8Strict";

const arbFlowMessage = vi.hoisted(() => vi.fn());

vi.mock("@/shared/a8Strict", () => ({
  isA8StrictMode: vi.fn(() => false),
}));

vi.mock("@/stores/messageStore", () => ({
  useMessageStore: () => ({ arbFlowMessage }),
}));

import type { ViewBet, ViewMatch } from "@/models/match";

const match = { id: "m1", title: "A VS B" } as unknown as ViewMatch;
const bet = { id: 1, getBetName: () => "全场" } as unknown as ViewBet;

describe("createArbFlowTrace", () => {
  beforeEach(() => {
    arbFlowMessage.mockClear();
    vi.mocked(isA8StrictMode).mockReturnValue(false);
  });

  it("is no-op in strict A8 mode", () => {
    vi.mocked(isA8StrictMode).mockReturnValue(true);
    const trace = createArbFlowTrace(match, bet, { implied: 1.02 });
    trace.event("预检", "x");
    trace.finish("fail", "test");
    expect(trace.id).toBe("");
    expect(arbFlowMessage).not.toHaveBeenCalled();
  });

  it("formats timeline body", () => {
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

  it("formats skip outcome title", () => {
    const body = formatArbFlowTelegramBody({
      id: "m1:1:1",
      matchTitle: "A VS B",
      betName: "全场",
      startedAt: Date.now(),
      events: [],
      outcome: "skip",
      summary: "无法构建双腿",
    });
    expect(body).toContain("套利执行跳过");
    expect(body).toContain("无法构建双腿");
  });

  it("enqueues arbFlowMessage on skip finish", async () => {
    const trace = createArbFlowTrace(match, bet, { implied: 1.05 });
    trace.finish("skip", "测试跳过");

    await vi.waitFor(() => {
      expect(arbFlowMessage).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: "skip", summary: "测试跳过" }),
      );
    });
  });
});
