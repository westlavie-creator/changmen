import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { PlatformAccount } from "@/models/platformAccount";
import { BetOption } from "@/models/betOption";
import { pbProvider } from "./bet";
import { setPbLineId } from "./lineCache";
import { pbRejectStorageKey } from "./rejectPoll";

const pbPost = vi.fn();
vi.mock("./transport", () => ({
  pbPost: (...args: unknown[]) => pbPost(...args),
}));

const sessionMock = new Map<string, string>();
vi.stubGlobal("sessionStorage", {
  getItem: (k: string) => sessionMock.get(k) ?? null,
  setItem: (k: string, v: string) => {
    sessionMock.set(k, v);
  },
  removeItem: (k: string) => {
    sessionMock.delete(k);
  },
  clear: () => sessionMock.clear(),
});

describe("pbProvider.getOrders", () => {
  const account = new PlatformAccount({
    accountId: 7,
    playerName: "pb",
    provider: "PB",
    gateway: "https://pb.example",
    token: "{}",
    multiply: 1,
  });

  beforeEach(() => {
    pbPost.mockReset();
    pbPost.mockResolvedValue([]);
    sessionMock.clear();
  });

  afterEach(() => {
    sessionMock.clear();
  });

  it("合并 sessionStorage 拒单缓存（对齐 A8 SQ）", async () => {
    const key = pbRejectStorageKey(account);
    sessionMock.set(
      key,
      JSON.stringify({
        provider: "PB",
        orderId: "pending-1",
        odds: 1.9,
        createAt: 999,
        betMoney: 100,
        reward: 0,
        money: 0,
        status: "reject",
        game: "LOL",
        match: "A vs B",
        bet: "全场",
        item: "A",
      }),
    );

    const orders = await pbProvider.getOrders!(account);
    expect(orders.some((o) => o.orderId === "pending-1" && o.status === "reject")).toBe(true);
  });
});

describe("pbProvider.checkBet", () => {
  const account = new PlatformAccount({
    accountId: 8,
    playerName: "pb-check",
    provider: "PB",
    gateway: "https://pb.example",
    token: "{}",
    multiply: 1,
  });

  beforeEach(() => {
    pbPost.mockReset();
  });

  it("赔率下降时返回明确预检错误", async () => {
    setPbLineId("bet-odds-drop", 123);
    pbPost.mockResolvedValue([
      {
        status: "AVAILABLE",
        minStake: 1,
        maxStake: 1000,
        odds: 2,
        lineId: 456,
      },
    ]);

    const option = new BetOption(
      "PB",
      "match-1",
      "bet-odds-drop",
      "a|b|c|d|e|f|g",
      100,
      "Away",
      2.05,
    );
    const checked = await pbProvider.checkBet!(account, option);

    expect(checked.data).toBeNull();
    expect(checked.checkError).toBe("赔率下降 2 < 2.05");
  });
});
