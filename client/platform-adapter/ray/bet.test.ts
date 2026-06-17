import { describe, expect, it, vi, beforeEach } from "vitest";
import { BetOption } from "@/models/betOption";
import { PlatformAccount } from "@/models/platformAccount";
import { rayProvider } from "./bet";

const accountGet = vi.fn();
vi.mock("@/shared/platformHttp", () => ({
  accountGet: (...args: unknown[]) => accountGet(...args),
  accountPostForm: vi.fn(),
}));

vi.mock("@/stores/messageStore", () => ({
  useMessageStore: () => ({
    limitMessage: () => "限红",
  }),
}));

vi.mock("@/stores/oddsStore", () => ({
  useOddsStore: () => ({
    save: vi.fn(),
  }),
}));

function makeOption(odds: number): BetOption {
  return {
    matchId: "m1",
    itemId: "oid-1",
    betMoney: 100,
    odds,
    updateOdds: BetOption.prototype.updateOdds,
    type: "RAY",
  } as unknown as BetOption;
}

function oddsResponse(liveOdds: number) {
  return {
    code: 200,
    result: {
      start_time: "2099-01-01T00:00:00Z",
      odds: [
        {
          odds_id: "oid-1",
          enable_parlay: 1,
          status: 1,
          odds: liveOdds,
          bet_limit: [10, 10_000],
          group_name: "独赢",
          name: "主队",
          match_name: "A vs B",
          match_stage: "全场",
        },
      ],
    },
  };
}

describe("rayProvider.checkBet", () => {
  const account = new PlatformAccount({
    accountId: 1,
    playerName: "ray",
    provider: "RAY",
    gateway: "https://ray.example",
    token: "t",
  });

  beforeEach(() => {
    accountGet.mockReset();
  });

  it("odds 请求 forceDirect 对齐 A8", async () => {
    accountGet.mockResolvedValue(oddsResponse(1.8));
    await rayProvider.checkBet!(account, makeOption(1.8));
    expect(accountGet).toHaveBeenCalledWith(
      account,
      "/v2/odds?match_id=m1",
      { forceDirect: true },
    );
  });

  it("客户端赔率高于场馆超过 0.01 时不写 data（对齐 A8 vYe）", async () => {
    accountGet.mockResolvedValue(oddsResponse(1.5));
    const option = makeOption(2);
    const out = await rayProvider.checkBet!(account, option);
    expect(out.data).toBeUndefined();
  });

  it("滑点允许范围内写入 data 且 odds 取场馆价", async () => {
    accountGet.mockResolvedValue(oddsResponse(1.88));
    const option = makeOption(1.89);
    const out = await rayProvider.checkBet!(account, option);
    expect(out.data).toBeDefined();
    expect(out.odds).toBe(1.88);
    const order = (out.data as { order: Array<{ order_detail: { odds: number } }> }).order[0];
    expect(order.order_detail.odds).toBe(1.88);
  });
});

describe("rayProvider.getOrders", () => {
  const account = new PlatformAccount({
    accountId: 2,
    playerName: "ray2",
    provider: "RAY",
    gateway: "https://ray.example",
    token: "t",
  });

  beforeEach(() => {
    accountGet.mockReset();
  });

  it("status=4 映射为 reject（对齐 A8 vYe）", async () => {
    accountGet.mockResolvedValue({
      code: 200,
      result: [
        {
          order_number: "R-1",
          status: 4,
          win: 0,
          total_bonus: 0,
          create_time: "2024-01-01 12:00:00",
          detail: [
            {
              title: "独赢\n主队",
              odds: 1.85,
              stake: 50,
              game_id: 1,
              match_name: "A vs B",
              match_stage: "全场",
            },
          ],
        },
      ],
    });
    const orders = await rayProvider.getOrders!(account);
    expect(orders[0]!.status).toBe("reject");
    expect(orders[0]!.orderId).toBe("R-1");
  });
});
