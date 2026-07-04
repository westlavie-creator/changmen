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

    trace.event("检测", "平台 RAY、OB");
    trace.event("选号", "RAY/acc1");
    trace.finish("success", "双腿成单");

    expect(deliver).toHaveBeenCalledOnce();
    const payload = deliver.mock.calls[0][0];
    expect(payload.outcome).toBe("success");
    expect(payload.events).toHaveLength(3);
    expect(payload.events[0].stage).toBe("发现");
  });

  it("formats structured PM leg blocks and timeline", () => {
    const body = formatArbProgressTelegramBody({
      id: "1:2:3",
      matchId: 1,
      betId: 2,
      matchTitle: "LYON vs FURIA",
      betName: "[地图1] 获胜",
      startedAt: 0,
      events: [
        { at: 500, stage: "发现", detail: "利润 3.0%" },
        { at: 1000, stage: "检测", detail: "平台 Polymarket、RAY" },
        { at: 1500, stage: "预检", detail: "见下方对冲腿详情" },
      ],
      outcome: "fail",
      summary: "Polymarket Home: 盘口价高于检测价",
      meta: {
        implied: 1.03,
        homeLine: "Polymarket@1.471",
        awayLine: "RAY@2.25",
        legs: [
          {
            side: "A",
            platform: "Polymarket",
            target: "Home",
            odds: 1.471,
            betMoney: 35,
            account: "Polymarket/wallet1",
            precheck: {
              ok: false,
              error: "盘口价高于检测价",
              polymarket: {
                tokenId: "74711611114983512613640395677280477708501472242194933077402249873861095364481",
                tokenShort: "747116…44981",
                detectionOdds: 1.471,
                detectionMaxPrice: 0.68,
                foClobPrice: 0.68,
                bookPrice: 0.681,
                apiBetMoney: 35,
                capSource: "clob",
              },
            },
          },
          {
            side: "B",
            platform: "RAY",
            target: "Away",
            odds: 2.25,
            betMoney: 80,
            account: "RAY/acc1",
            precheck: { ok: true },
          },
        ],
      },
    });

    expect(body).toContain("🔴 套利执行失败");
    expect(body).toContain("【对冲腿】");
    expect(body).toContain("主腿 · Polymarket · Home");
    expect(body).toContain("token：747116…44981");
    expect(body).toContain("检测上限：0.6800（fo clob）");
    expect(body).toContain("盘口 ask：0.6810");
    expect(body).toContain("预检：❌ 盘口价高于检测价");
    expect(body).toContain("客腿 · RAY · Away");
    expect(body).toContain("【执行过程】");
    expect(body).not.toContain("见下方对冲腿详情");
    expect(body).toContain("00:01 🔍 检测");
    expect(body).toContain("耗时 1.5s");
  });

  it("setMeta merges prior meta fields", () => {
    const deliver = vi.fn();
    const trace = createArbExecutionTrace(
      match,
      bet,
      { implied: 1.05, homeLine: "A@2", awayLine: "B@2" },
      deliver,
    );

    trace.setMeta({
      legs: [{
        side: "A",
        platform: "A",
        target: "Home",
        odds: 2,
        betMoney: 10,
      }],
    });
    trace.finish("skip", "test");

    const payload = deliver.mock.calls[0][0];
    expect(payload.meta?.implied).toBe(1.05);
    expect(payload.meta?.legs).toHaveLength(1);
  });

  it("ignores events after finish", () => {
    const deliver = vi.fn();
    const trace = createArbExecutionTrace(match, bet, undefined, deliver);
    trace.finish("skip", "done");
    trace.event("late", "ignored");
    expect(deliver.mock.calls[0][0].events).toHaveLength(0);
  });
});
