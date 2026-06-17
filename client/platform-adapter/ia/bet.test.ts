import { describe, expect, it, vi, beforeEach } from "vitest";
import { PlatformAccount } from "@/models/platformAccount";
import { iaProvider, mapIaHistoryRow } from "./bet";

const accountIaPost = vi.fn();
vi.mock("@/shared/platformHttp", () => ({
  accountIaPost: (...args: unknown[]) => accountIaPost(...args),
}));

vi.mock("@/shared/wait", () => ({
  wait: vi.fn().mockResolvedValue(undefined),
}));

describe("mapIaHistoryRow", () => {
  it("receive_status=2 映射为 reject（对齐 A8 CYe）", () => {
    const order = mapIaHistoryRow(
      {
        order_id: "ia-1",
        odds: 2.1,
        create_time: 1_700_000_000,
        amount: 80,
        desc: "全场独赢TeamA",
        team_name_1: "TeamA",
        team_name_2: "TeamB",
        receive_status: 2,
        game_name: "LOL",
      },
      "IA",
    );
    expect(order.status).toBe("reject");
    expect(order.createAt).toBe(1_700_000_000_000);
  });

  it("receive_status=1 映射为 pending", () => {
    const order = mapIaHistoryRow({ order_id: "p1", receive_status: 1 }, "IA");
    expect(order.status).toBe("pending");
  });
});

describe("iaProvider.getOrders", () => {
  const account = new PlatformAccount({
    accountId: 1,
    playerName: "ia",
    provider: "IA",
    gateway: "https://ia.example",
    token: "tok",
  });

  beforeEach(() => {
    accountIaPost.mockReset();
  });

  it("无 gateway/token 返回空数组", async () => {
    const bare = { ...account, gateway: "", token: "" } as PlatformAccount;
    await expect(iaProvider.getOrders!(bare)).resolves.toEqual([]);
    expect(accountIaPost).not.toHaveBeenCalled();
  });

  it("pending 时轮询直至无 pending（对齐 A8 CYe 3s 循环）", async () => {
    accountIaPost
      .mockResolvedValueOnce({
        data: {
          data: [{ order_id: "1", receive_status: 1, create_time: 1, desc: "x" }],
        },
      })
      .mockResolvedValueOnce({
        data: {
          data: [{ order_id: "1", receive_status: 2, create_time: 1, desc: "x" }],
        },
      });

    const orders = await iaProvider.getOrders!(account);
    expect(accountIaPost).toHaveBeenCalledTimes(2);
    expect(orders[0]!.status).toBe("reject");
    expect(accountIaPost.mock.calls[0]![1]).toContain("/api/game/user/getUserHistory/");
  });
});
