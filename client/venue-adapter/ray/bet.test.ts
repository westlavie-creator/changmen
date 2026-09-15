import { describe, expect, it, vi, beforeEach } from "vitest";
import { BetOption } from "@changmen/client-core/models/betOption";
import { PlatformAccount } from "@changmen/client-core/models/platformAccount";
import {
  RAY_PLACE_QUOTE_STALE_MS,
  rayProvider,
  shouldRelockRayPlaceQuote,
} from "./bet";

const { accountGet, accountPostForm } = vi.hoisted(() => ({
  accountGet: vi.fn(),
  accountPostForm: vi.fn(),
}));
vi.mock("./accountHttp", () => ({
  accountGet: (...args: unknown[]) => accountGet(...args),
  accountPostForm: (...args: unknown[]) => accountPostForm(...args),
}));

vi.mock("@changmen/client-core/bridge/oddsAccess", () => ({
  readVenueOdds: vi.fn(() => 0),
  writeVenueOdds: vi.fn(),
}));

vi.mock("../shared/webBridge", () => ({
  useMessageStore: () => ({
    limitMessage: () => "限红",
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

describe("shouldRelockRayPlaceQuote", () => {
  it("无 data 或无 checkedAt 视为过期", () => {
    expect(shouldRelockRayPlaceQuote({ data: null })).toBe(true);
    expect(shouldRelockRayPlaceQuote({ data: { ok: 1 } })).toBe(true);
  });

  it("checkedAt 在窗口内不重拉", () => {
    const now = 1_700_000_000_400;
    expect(shouldRelockRayPlaceQuote(
      { data: { ok: 1 }, checkedAt: now - RAY_PLACE_QUOTE_STALE_MS },
      now,
    )).toBe(false);
    expect(shouldRelockRayPlaceQuote(
      { data: { ok: 1 }, checkedAt: now - RAY_PLACE_QUOTE_STALE_MS - 1 },
      now,
    )).toBe(true);
  });
});

describe("rayProvider.betting lock-live", () => {
  const account = new PlatformAccount({
    accountId: 3,
    playerName: "ray3",
    provider: "RAY",
    gateway: "https://ray.example",
    token: "t",
  });

  beforeEach(() => {
    accountGet.mockReset();
    accountPostForm.mockReset();
    accountPostForm.mockResolvedValue({ code: 200, result: 999 });
  });

  function postedOrder(): { total_stake: string; order: Array<{ order_detail: { odds: number } }> } {
    const body = accountPostForm.mock.calls[0]![2] as { order: string };
    return JSON.parse(body.order);
  }

  it("冻价未过期则不二次 GET，直接 POST", async () => {
    const option = makeOption(2.23);
    option.data = { frozen: true };
    option.checkedAt = Date.now();
    await rayProvider.betting(account, option);
    expect(accountGet).not.toHaveBeenCalled();
    expect(accountPostForm).toHaveBeenCalledTimes(1);
    expect(JSON.parse((accountPostForm.mock.calls[0]![2] as { order: string }).order)).toEqual({ frozen: true });
  });

  it("过期后 2.23→2.12 按现价组单 POST，本金不变", async () => {
    accountGet.mockResolvedValue(oddsResponse(2.12));
    const option = makeOption(2.23);
    option.betMoney = 180;
    option.data = { frozen: 2.23 };
    option.checkedAt = Date.now() - RAY_PLACE_QUOTE_STALE_MS - 1;
    const result = await rayProvider.betting(account, option);
    expect(result.success).toBe(true);
    expect(option.odds).toBe(2.12);
    const order = postedOrder();
    expect(order.total_stake).toBe("180");
    expect(order.order[0]!.order_detail.odds).toBe(2.12);
  });

  it("过期后赔率上涨按现价 POST", async () => {
    accountGet.mockResolvedValue(oddsResponse(2.3));
    const option = makeOption(2.23);
    option.betMoney = 180;
    option.data = { frozen: 2.23 };
    option.checkedAt = Date.now() - RAY_PLACE_QUOTE_STALE_MS - 1;
    const result = await rayProvider.betting(account, option);
    expect(result.success).toBe(true);
    expect(postedOrder().order[0]!.order_detail.odds).toBe(2.3);
  });

  it("过期后现价非法则拒绝 POST", async () => {
    accountGet.mockResolvedValue(oddsResponse(Number.NaN));
    const option = makeOption(2.23);
    option.data = { frozen: 2.23 };
    option.checkedAt = Date.now() - RAY_PLACE_QUOTE_STALE_MS - 1;
    const result = await rayProvider.betting(account, option);
    expect(accountPostForm).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.message).toBe("预检失败");
  });

  it("过期后掉幅超过滑点则拒绝 POST", async () => {
    accountGet.mockResolvedValue(oddsResponse(1.9));
    const option = makeOption(2.23);
    option.data = { frozen: 2.23 };
    option.checkedAt = Date.now() - RAY_PLACE_QUOTE_STALE_MS - 1;
    const result = await rayProvider.betting(account, option);
    expect(accountPostForm).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.message).toBe("赔率下降至1.9");
    expect(option.data).toBeNull();
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

  it("status=1 win=0 maps to lose", async () => {
    accountGet.mockResolvedValue({
      code: 200,
      result: [
        {
          order_number: "R-lose",
          status: 1,
          win: 0,
          total_bonus: 0,
          create_time: "2024-01-01 12:00:00",
          detail: [{ title: "独赢\n主队", odds: 1.85, stake: 50, match_name: "A vs B", match_stage: "全场" }],
        },
      ],
    });
    const orders = await rayProvider.getOrders!(account);
    expect(orders[0]!.status).toBe("lose");
    expect(orders[0]!.money).toBe(-50);
  });

  it("按 createAt 降序，拒单检测取首条（对齐 A8 isVenueReject）", async () => {
    accountGet.mockResolvedValue({
      code: 200,
      result: [
        {
          order_number: "old-win",
          status: 1,
          win: 0,
          total_bonus: 100,
          create_time: "2024-01-01 10:00:00",
          detail: [
            {
              title: "独赢\n主队",
              odds: 1.5,
              stake: 100,
              game_id: 1,
              match_name: "A vs B",
              match_stage: "全场",
            },
          ],
        },
        {
          order_number: "new-reject",
          status: 4,
          win: 0,
          total_bonus: 0,
          create_time: "2024-01-01 12:00:00",
          detail: [
            {
              title: "独赢\n客队",
              odds: 2.1,
              stake: 80,
              game_id: 1,
              match_name: "A vs B",
              match_stage: "全场",
            },
          ],
        },
      ],
    });
    const orders = await rayProvider.getOrders!(account);
    expect(orders[0]!.orderId).toBe("new-reject");
    expect(orders[0]!.status).toBe("reject");
  });
});
