import { describe, expect, it } from "vitest";
import type { AdminAccountDetail, AdminOrderRow } from "@/types/admin";
import {
  adminOrderToOrderRow,
  adminPlayerLabel,
  groupAdminOrderEntries,
} from "./adminOrderDisplay";
import {
  pmBuyLifecycleTagText,
  pmOrderStakeDisplayCny,
  resolvePmOrderListStatusClass,
} from "./pmOrderDisplay";

function order(patch: Partial<AdminOrderRow>): AdminOrderRow {
  return {
    id: 1,
    userId: "u1",
    playerId: 101,
    orderId: "o1",
    linkId: 1_700_000_000_000,
    provider: "OB",
    match: "A vs B",
    bet: "全场",
    item: "主",
    odds: 1.9,
    betMoney: 100,
    money: 0,
    status: "None",
    createAt: 1_700_000_000_000,
    ...patch,
  };
}

function account(patch: Partial<AdminAccountDetail>): AdminAccountDetail {
  return {
    accountId: 101,
    platform: "PB",
    platformId: 0,
    platformName: "平博",
    playerName: "tester",
    balance: 0,
    credit: 0,
    currency: "CNY",
    winBalance: 0,
    unsettle: 0,
    proxyId: 0,
    pause: false,
    markupOnly: false,
    noMarkup: false,
    active: false,
    minOdds: 0,
    maxOdds: 0,
    minDefault: 0,
    maxDefault: 0,
    profit: 0,
    maxProfit: 0,
    maxBetCount: 0,
    maxOrder: 0,
    todayOrder: 0,
    today: 0,
    orderCount: 0,
    totalProfit: 0,
    maxBalance: 0,
    maxWinBalance: 0,
    description: "",
    realName: "",
    mobile: "",
    city: "",
    multiply: 1,
    maxBalanceOdds: 2,
    lastOdds: false,
    workTimes: [],
    rateConfig: [],
    game: {},
    gatewayHost: "",
    hasCredentials: false,
    updateTime: 0,
    ...patch,
  };
}

describe("adminOrderDisplay", () => {
  it("uses the betting account platform for the provider icon", () => {
    expect(adminOrderToOrderRow(order({ provider: "OB" }), [account({ platform: "PB" })]).Type)
      .toBe("PB");

    const grouped = groupAdminOrderEntries(
      [order({ orderId: "hg-1", playerId: 202, provider: "OB" })],
      [account({ accountId: 202, platform: "HG" })],
    );

    expect(grouped[0]?.orderRows[0]?.Type).toBe("HG");
  });

  it("falls back to the stored order provider when the account is unavailable", () => {
    expect(adminOrderToOrderRow(order({ provider: "OB" }), []).Type).toBe("OB");
  });

  it("keeps Type=Polymarket even when account platform differs so PM list template applies", () => {
    expect(adminOrderToOrderRow(
      order({
        provider: "Polymarket",
        playerId: 101,
        betMoney: 0,
        money: 0,
        status: "None",
        pmSide: "buy",
        pmSellState: "closed",
        pmStakeUsdc: 0,
        pmShares: 10,
        pmAttributedSellShares: 10,
        pmFillPrice: 0.5,
      }),
      [account({ accountId: 101, platform: "OB", platformName: "误配" })],
    ).Type).toBe("Polymarket");
  });

  it("maps PM fields for workbench-parity OrderList display", () => {
    const row = adminOrderToOrderRow(order({
      provider: "Polymarket",
      betMoney: 0,
      money: 0,
      status: "None",
      pmSide: "buy",
      pmSellState: "closed",
      pmStakeUsdc: 0,
      pmShares: 57.66,
      pmAttributedSellShares: 57.66,
      pmFillPrice: 0.5,
      pmOrigin: "changmen",
    }));
    expect(row.PmSellState).toBe("closed");
    expect(row.PmSide).toBe("buy");
    expect(row.PmShares).toBe(57.66);
    expect(row.PmAttributedSellShares).toBe(57.66);
    expect(row.PmFillPrice).toBe(0.5);
    expect(row.PmOrigin).toBe("changmen");
    expect(pmBuyLifecycleTagText(row)).toBe("已卖出");
    expect(resolvePmOrderListStatusClass(row)).toBe("PmSold");
    // 已卖出买单仍展示原始本金（fill×价），不为 0
    expect(pmOrderStakeDisplayCny(row)).toBe(Math.round(57.66 * 0.5 * 6.8));
  });

  it("uses venueAccountName in player label", () => {
    expect(adminPlayerLabel(
      adminOrderToOrderRow(order({ playerId: 101 }), [account({ accountId: 101 })]),
      [account({ accountId: 101, venueAccountName: "ray_live", playerName: "old" })],
    )).toBe("平博 / ray_live");
  });
});
