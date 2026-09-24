import { describe, expect, it } from "vitest";
import type { AdminOrderLogLegSection } from "@/types/admin";
import {
  buildAdminOrderDiagnosisSummary,
  buildAdminOrderExecutionSteps,
} from "@/shared/adminOrderDiagnosis";

describe("adminOrderDiagnosis", () => {
  it("renders failed PM, accepted-then-rejected RAY, and makeup in true time order", () => {
    const legs: AdminOrderLogLegSection[] = [
      {
        key: "home",
        legIndex: 0,
        side: "Home",
        label: "主队",
        provider: "Polymarket/RAY",
        attempts: [
          {
            key: "pm-fail",
            order: null,
            logs: [],
            logSegments: [{
              key: "pm",
              provider: "Polymarket",
              accountLabel: "PM / a",
              isMakeUp: false,
              logs: [
                { createAt: 100, title: "", kind: "check", provider: "Polymarket", target: "Home", odds: 2.272, betMoney: 38.21, planBetMoney: 256.16, stakeExchange: 6.7, stakeRate: 1, summary: "check" },
                { createAt: 120, title: "", kind: "bet", provider: "Polymarket", success: false, message: "FOK 深度不足", summary: "fail" },
              ],
            }],
          },
          {
            key: "ray-makeup",
            order: { orderId: "m1", link: 1, provider: "RAY", playerId: 1, match: "m", bet: "b", item: "Apogee", odds: 1.86, betMoney: 313, money: -313, status: "Lose", createAt: 400 },
            logs: [],
            logSegments: [{
              key: "makeup",
              provider: "RAY",
              accountLabel: "RAY / a",
              isMakeUp: true,
              logs: [
                { createAt: 400, title: "", kind: "check", provider: "RAY", target: "Home", odds: 1.86, betMoney: 313, loseOrder: true, summary: "check" },
                { createAt: 410, title: "", kind: "bet", provider: "RAY", success: true, summary: "ok" },
              ],
            }],
          },
        ],
      },
      {
        key: "away",
        legIndex: 1,
        side: "Away",
        label: "客队",
        provider: "RAY",
        attempts: [{
          key: "ray-away",
          order: { orderId: "r1", link: 1, provider: "RAY", playerId: 1, match: "m", bet: "b", item: "ASTRAL", odds: 1.94, betMoney: 300, money: 0, status: "Reject", createAt: 110 },
          logs: [],
          logSegments: [{
            key: "ray",
            provider: "RAY",
            accountLabel: "RAY / a",
            isMakeUp: false,
            logs: [
              { createAt: 110, title: "", kind: "check", provider: "RAY", target: "Away", odds: 1.94, betMoney: 300, summary: "check" },
              { createAt: 130, title: "", kind: "bet", provider: "RAY", success: true, summary: "ok" },
            ],
          }],
        }],
      },
    ];

    const steps = buildAdminOrderExecutionSteps(legs);
    expect(steps.map(step => step.provider)).toEqual(["Polymarket", "RAY", "RAY"]);
    expect(steps.map(step => step.outcome)).toEqual([
      "下单失败",
      "接口受理 → 场馆拒单",
      "接口受理 → 已结算：输",
    ]);
    expect(steps[2].isMakeUp).toBe(true);
    expect(steps[0].rejectLogic).toContain("即时失败");
    expect(steps[0].rejectLogic).toContain("20ms");
    expect(steps[0].stakeLogic).toContain("计划金额 ¥256.16");
    expect(steps[1].rejectLogic).toContain("事后拒单");
    expect(steps[1].rejectLogic).toContain("无法计算间隔");
    expect(steps[2].oddsLogic).toContain("场馆实时盘口");
    expect(steps[2].stakeLogic).toContain("300 × 1.94 ÷ 实时赔率 1.86");
    expect(buildAdminOrderDiagnosisSummary(steps, -313)).toEqual({
      text: "原始套利未成立：1 腿下单失败，1 笔场馆拒单；随后执行 1 次补单；最终 Link 盈亏 ¥-313",
      tone: "danger",
    });
  });

  it("uses structured settlement logs for exact post-accept reject delay and reason", () => {
    const legs: AdminOrderLogLegSection[] = [{
      key: "away",
      legIndex: 1,
      side: "Away",
      label: "客队",
      provider: "RAY",
      attempts: [{
        key: "ray-away",
        order: null,
        logs: [],
        logSegments: [{
          key: "ray",
          provider: "RAY",
          accountLabel: "RAY / a",
          isMakeUp: false,
          logs: [
            { createAt: 1_000, title: "", kind: "check", provider: "RAY", target: "Away", odds: 1.78, betMoney: 70, summary: "check" },
            { createAt: 1_100, title: "", kind: "bet", provider: "RAY", success: true, summary: "ok" },
            { createAt: 31_000, title: "", kind: "reject", provider: "RAY", target: "Away", settlement: "unfilled", rejectDelayMs: 30_000, rejectReason: "额度不足", summary: "reject" },
          ],
        }],
      }],
    }];

    const [step] = buildAdminOrderExecutionSteps(legs);
    expect(step?.outcome).toBe("接口受理 → 场馆拒单");
    expect(step?.rejectLogic).toContain("间隔 30秒");
    expect(step?.rejectLogic).toContain("额度不足");
  });

  it("does not attach a later makeup order terminal status to an earlier failed attempt", () => {
    const order = { orderId: "ob-makeup", link: 1, provider: "OB", playerId: 1, match: "m", bet: "b", item: "TYLOO", odds: 3.015, betMoney: 41, money: -41, status: "Lose", createAt: 78_000 };
    const legs: AdminOrderLogLegSection[] = [{
      key: "home",
      legIndex: 0,
      side: "Home",
      label: "主队",
      provider: "OB",
      attempts: [{
        key: "ob-makeup",
        order,
        logs: [],
        logSegments: [
          {
            key: "initial-fail",
            provider: "OB",
            accountLabel: "OB / a",
            isMakeUp: false,
            logs: [
              { createAt: 100, title: "", kind: "check", provider: "OB", target: "Home", odds: 2.518, betMoney: 49, summary: "check" },
              { createAt: 200, title: "", kind: "bet", provider: "OB", success: false, message: "赔率错误", summary: "fail" },
            ],
          },
          {
            key: "makeup",
            provider: "OB",
            accountLabel: "OB / a",
            isMakeUp: true,
            logs: [
              { createAt: 78_000, title: "", kind: "check", provider: "OB", target: "Home", odds: 3.015, betMoney: 41, loseOrder: true, summary: "check" },
              { createAt: 78_100, title: "", kind: "bet", provider: "OB", success: true, summary: "ok" },
            ],
          },
        ],
      }],
    }];

    const steps = buildAdminOrderExecutionSteps(legs);
    expect(steps[0].order).toBeNull();
    expect(steps[0].outcome).toBe("下单失败");
    expect(steps[1].order?.orderId).toBe("ob-makeup");
    expect(steps[1].outcome).toBe("接口受理 → 已结算：输");
  });
});
