import { describe, expect, it } from "vitest";
import type { AdminAccountDetail } from "@/types/admin";
import { adminAccountToPlatformAccount, buildAdminAccountDisplayRows } from "@/components/admin/adminAccountDisplay";

function account(patch: Partial<AdminAccountDetail>): AdminAccountDetail {
  return {
    accountId: 101,
    platform: "OB",
    platformId: 0,
    platformName: "OB",
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
    hasCredentials: true,
    updateTime: 0,
    ...patch,
  };
}

describe("adminAccountToPlatformAccount", () => {
  it("passes venueAccountName into PlatformAccount for admin preview", () => {
    const acc = adminAccountToPlatformAccount(account({
      accountId: 105,
      platform: "Polymarket",
      platformName: "pm",
      playerName: "pn",
      venueMemberId: "9034407",
      venueAccountName: "kakaxiduo",
    }));
    expect(acc.venueAccountName).toBe("kakaxiduo");
    expect(acc.venueMemberId).toBe("9034407");
  });
});

describe("buildAdminAccountDisplayRows", () => {
  it("uses venueAccountName in title", () => {
    const [row] = buildAdminAccountDisplayRows([account({
      accountId: 13,
      platform: "OB",
      platformName: "OB",
      playerName: "5",
      venueAccountName: "p07chengyan124",
    })]);
    expect(row.title).toBe("OB / p07chengyan124");
  });
});
