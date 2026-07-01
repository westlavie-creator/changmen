import type { ViewMatch } from "@/models/match";
import type { PlatformId } from "@/types/esport";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BetOption } from "@/models/betOption";
import { LoseOrder } from "@/models/loseOrder";
import { PlatformAccount } from "@/models/platformAccount";
import { processLoseOrders } from "@/stores/betting/loseOrder";

import { createDefaultUserConfig } from "@/types/userConfig";

const loseOrders = vi.hoisted(() => new Map<number, LoseOrder>());
const matchs = vi.hoisted(() => [] as ViewMatch[]);

const removeOrder = vi.hoisted(() => vi.fn());
const getAccount = vi.hoisted(() => vi.fn());
const checkBetting = vi.hoisted(() => vi.fn());
const betting = vi.hoisted(() => vi.fn());
const loseOrderMessage = vi.hoisted(() => vi.fn());
const markSuccessfulBet = vi.hoisted(() => vi.fn());
const saveOrderBind = vi.hoisted(() => vi.fn());
const a8Tip = vi.hoisted(() => vi.fn());
const wait = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("@/stores/configStore", () => ({
  useConfigStore: () => ({
    config: {
      ...createDefaultUserConfig(),
      makeUp: true,
      makeProfit: 1.01,
      noSameProvider: false,
      waitTime: { OB: 10, RAY: 10 },
    },
  }),
}));

vi.mock("@/stores/matchStore", () => ({
  useMatchStore: () => ({
    matchs,
    getDefaultOdds: () => undefined,
    getBetTarget: () => undefined,
  }),
}));

vi.mock("@/stores/loseOrderStore", () => ({
  useLoseOrderStore: () => ({
    orders: loseOrders,
    removeOrder,
    has: (id: number) => loseOrders.has(id),
  }),
}));

vi.mock("@/stores/accountStore", () => ({
  useAccountStore: () => ({
    getAccount,
    checkBetting,
    betting,
  }),
}));

vi.mock("@/stores/messageStore", () => ({
  useMessageStore: () => ({ loseOrderMessage }),
}));

vi.mock("@/stores/betting/successMarkers", () => ({
  markSuccessfulBet,
  readUsedAccounts: vi.fn(() => []),
}));

vi.mock("@/api/esport", () => ({ saveOrderBind }));

vi.mock("@/shared/a8Notify", () => ({ a8Tip }));

vi.mock("@/shared/wait", () => ({ wait }));

vi.mock("@/shared/betTiming", () => ({
  makeUpBetToastSeconds: vi.fn(() => 10),
}));

function makeItem(type: PlatformId, homeOdds: number) {
  return {
    type,
    matchId: "m1",
    betId: "b1",
    updateOdds: vi.fn(),
    getOdds: (side: string) => (side === "Home" ? homeOdds : 2),
    getItemId: (side: string) => `${type}:${side}`,
  };
}

function makeBet(items: ReturnType<typeof makeItem>[]) {
  return {
    id: 100,
    getBetName: () => "地图1",
    items,
  };
}

function makeMatch(bet: ReturnType<typeof makeBet>): ViewMatch {
  return {
    id: 1,
    title: "A vs B",
    game: "英雄联盟",
    gameId: 1,
    bets: [bet],
  } as unknown as ViewMatch;
}

function queueOrder(patch: Partial<ConstructorParameters<typeof LoseOrder>[0]> = {}) {
  const order = new LoseOrder({
    accountId: 1,
    matchId: 1,
    betId: 100,
    target: "Home",
    betMoney: 100,
    betOdds: 1.85,
    match: "A vs B",
    bet: "地图1",
    linkId: 1_000_000_000_001,
    isCreateOrder: false,
    ...patch,
  });
  loseOrders.set(100, order);
  return order;
}

describe("processLoseOrders (A8 jb parity)", () => {
  beforeEach(() => {
    loseOrders.clear();
    matchs.length = 0;
    vi.clearAllMocks();
    getAccount.mockReset();
    checkBetting.mockReset();
    betting.mockReset();
  });

  it("每 tick 每个 item 只 getAccount 一次；下注失败继续下一 item", async () => {
    const bet = makeBet([makeItem("OB", 2.5), makeItem("RAY", 2.4)]);
    matchs.push(makeMatch(bet));
    queueOrder();

    const obAcc = new PlatformAccount({ accountId: 1, playerName: "ob1", provider: "OB" });
    const rayAcc = new PlatformAccount({ accountId: 2, playerName: "ray1", provider: "RAY" });
    getAccount.mockImplementation((provider: PlatformId) =>
      provider === "OB" ? obAcc : rayAcc,
    );
    checkBetting.mockImplementation(async (_acc, opt: BetOption) => {
      opt.data = { ok: true };
      return opt;
    });
    betting.mockImplementation(async (acc: PlatformAccount) => {
      return { success: false, provider: acc.provider };
    });

    await processLoseOrders({ setMessage: vi.fn() });

    expect(getAccount).toHaveBeenCalledTimes(2);
    expect(betting).toHaveBeenCalledTimes(2);
    expect(removeOrder).not.toHaveBeenCalled();
  });

  it("aPI 成功 + 场馆拒单：不移出队列，仍绑单并发 LoseOrderMessage", async () => {
    const bet = makeBet([makeItem("OB", 2.5)]);
    matchs.push(makeMatch(bet));
    queueOrder();

    const acc = new PlatformAccount({ accountId: 1, playerName: "ob1", provider: "OB" });
    acc.updateOrders = vi.fn(async () => [
      {
        orderId: "oid1",
        provider: "OB",
        status: "reject",
        createAt: 1,
        odds: 2,
        betMoney: 16,
        reward: 0,
        money: 0,
        match: "",
        bet: "",
        item: "",
        game: "",
      },
    ]) as PlatformAccount["updateOrders"];

    getAccount.mockReturnValue(acc);
    checkBetting.mockImplementation(async (_acc, opt: BetOption) => {
      opt.data = { ok: true };
      return opt;
    });
    betting.mockResolvedValue({ success: true, provider: "OB" });

    await processLoseOrders({ setMessage: vi.fn() });

    expect(removeOrder).not.toHaveBeenCalled();
    expect(saveOrderBind).toHaveBeenCalled();
    expect(loseOrderMessage).toHaveBeenCalledWith(
      acc,
      expect.any(LoseOrder),
      expect.any(BetOption),
      true,
    );
    expect(markSuccessfulBet).toHaveBeenCalled();
  });

  it("isCreateOrder 成功：出队、markSuccessfulBet，不发 LoseOrderMessage", async () => {
    const bet = makeBet([makeItem("OB", 2.5)]);
    matchs.push(makeMatch(bet));
    queueOrder({ isCreateOrder: true });

    const acc = new PlatformAccount({ accountId: 1, playerName: "ob1", provider: "OB" });
    getAccount.mockReturnValue(acc);
    checkBetting.mockImplementation(async (_acc, opt: BetOption) => {
      opt.data = { ok: true };
      return opt;
    });
    betting.mockResolvedValue({ success: true, provider: "OB" });

    await processLoseOrders({ setMessage: vi.fn() });

    expect(removeOrder).toHaveBeenCalledWith(100, true);
    expect(loseOrderMessage).not.toHaveBeenCalled();
    expect(a8Tip).not.toHaveBeenCalled();
    expect(markSuccessfulBet).toHaveBeenCalledWith(acc, 100, "Home");
  });
});
