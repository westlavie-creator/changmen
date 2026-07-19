import type { ViewBet, ViewBetItem, ViewMatch } from "@/models/match";
import { beforeEach, describe, expect, it, vi } from "vitest";

const updateVenueOrders = vi.hoisted(() => vi.fn(async () => []));
const refreshBalance = vi.hoisted(() => vi.fn(async () => undefined));
const checkBetting = vi.hoisted(() => vi.fn(async (opt: unknown) => {
  const o = opt as { data?: unknown };
  o.data = {};
  return o;
}));
const betting = vi.hoisted(() => vi.fn(async () => ({
  success: true,
  orderId: "0xabc",
})));
const getAccount = vi.hoisted(() => vi.fn());
const refreshOrderListAfterBind = vi.hoisted(() => vi.fn());
const markSuccessfulBet = vi.hoisted(() => vi.fn());
const wait = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("@/stores/accountStore", () => ({
  useAccountStore: () => ({
    getAccount,
    checkBetting,
    betting,
    updateVenueOrders,
    refreshBalance,
  }),
}));
vi.mock("@/stores/userStore", () => ({
  useUserStore: () => ({ config: { betMoney: 10 } }),
}));
vi.mock("@/stores/matchStore", () => ({
  useMatchStore: () => ({}),
}));
vi.mock("@/stores/betting/arbOrderBind", () => ({
  refreshOrderListAfterBind,
}));
vi.mock("@/stores/betting/successMarkers", () => ({
  markSuccessfulBet,
}));
vi.mock("@/domain/betting/betFilters", () => ({
  accountPassesMainBetFilter: () => true,
}));
vi.mock("@/domain/betting/singleLegRate", () => ({
  isSingleLegRateAtOdds: () => false,
}));
vi.mock("@changmen/client-core/shared/wait", () => ({ wait }));
vi.mock("element-plus", () => ({
  ElMessageBox: {
    prompt: vi.fn(async () => ({ value: "25" })),
    alert: vi.fn(async () => undefined),
  },
}));

import { runManualBet } from "@/stores/betting/manualBet";

describe("runManualBet post-success sync", () => {
  beforeEach(() => {
    updateVenueOrders.mockClear();
    refreshBalance.mockClear();
    refreshOrderListAfterBind.mockClear();
    markSuccessfulBet.mockClear();
    wait.mockClear();
    betting.mockClear();
    checkBetting.mockClear();
    getAccount.mockReset();
    getAccount.mockReturnValue({
      provider: "Polymarket",
      getBalance: () => 1000,
    });
  });

  it("waits then updateVenueOrders + refresh sidebar after success", async () => {
    const match = { title: "A vs B", bets: [], game: "Valorant" } as unknown as ViewMatch;
    const bet = {
      id: 1,
      homeName: "A",
      awayName: "B",
      getBetName: () => "Map 1",
      items: [],
    } as unknown as ViewBet;
    const item = {
      type: "Polymarket",
      matchId: "m1",
      betId: "b1",
      getOdds: () => 1.8,
      getItemId: () => "i1",
    } as unknown as ViewBetItem;

    await runManualBet(match, bet, item, "Home", { setMessage: vi.fn() });

    expect(wait).toHaveBeenCalledWith(400);
    expect(updateVenueOrders).toHaveBeenCalledOnce();
    expect(refreshOrderListAfterBind).toHaveBeenCalledOnce();
    expect(refreshBalance).toHaveBeenCalledOnce();
    expect(markSuccessfulBet).toHaveBeenCalledOnce();
  });
});
