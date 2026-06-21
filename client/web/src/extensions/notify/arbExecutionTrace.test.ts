import type { ViewBet, ViewMatch } from "@/models/match";
import { describe, expect, it, vi } from "vitest";
import {
  createArbExecutionTrace,
  formatArbProgressTelegramBody,
} from "@/extensions/notify";

describe("arbExecutionTrace", () => {
  const match = { id: 1, title: "A vs B" } as ViewMatch;
  const bet = { id: 2, getBetName: () => "[地图2] 获胜" } as ViewBet;

  it("accumulates events and delivers on finish", () => {
    const deliver = vi.fn();
    const trace = createArbExecutionTrace(
      match,
      bet,
      { implied: 1.032, homeLine: "RAY@2.25", awayLine: "OB@1.905" },
      deliver,
    );

    trace.event("检测", "RAY@2.25 / OB@1.905");
    trace.event("选号", "RAY/acc1");
    trace.finish("success", "双腿成单");

    expect(deliver).toHaveBeenCalledOnce();
    const payload = deliver.mock.calls[0][0];
    expect(payload.outcome).toBe("success");
    expect(payload.events).toHaveLength(3);
    expect(payload.events[0].stage).toBe("发现");
  });

  it("formats telegram body with timeline", () => {
    const body = formatArbProgressTelegramBody({
      id: "1:2:3",
      matchId: 1,
      betId: 2,
      matchTitle: "A vs B",
      betName: "[地图2] 获胜",
      startedAt: 0,
      events: [{ at: 1500, stage: "预检", detail: "RAY ✅" }],
      outcome: "fail",
      summary: "预检未通过",
      meta: { implied: 1.03, homeLine: "RAY@2.25", awayLine: "OB@1.905" },
    });

    expect(body).toContain("套利执行失败");
    expect(body).toContain("预检未通过");
    expect(body).toContain("00:01 预检");
  });

  it("setMeta adds discovery event once", () => {
    const deliver = vi.fn();
    const trace = createArbExecutionTrace(match, bet, undefined, deliver);

    trace.setMeta({ implied: 1.05, homeLine: "A@2", awayLine: "B@2" });
    trace.finish("skip", "test");

    const events = deliver.mock.calls[0][0].events;
    expect(events.filter((e: { stage: string }) => e.stage === "发现")).toHaveLength(1);
  });

  it("ignores events after finish", () => {
    const deliver = vi.fn();
    const trace = createArbExecutionTrace(match, bet, undefined, deliver);
    trace.finish("skip", "done");
    trace.event("late", "ignored");
    expect(deliver.mock.calls[0][0].events).toHaveLength(0);
  });
});
