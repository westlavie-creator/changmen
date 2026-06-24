import { describe, expect, it } from "vitest";
import type { AdminAccountDetail, AdminOrderRow } from "@/types/admin";
import {
  adminOrderToOrderRow,
  groupAdminOrderEntries,
} from "./adminOrderDisplay";

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
});
