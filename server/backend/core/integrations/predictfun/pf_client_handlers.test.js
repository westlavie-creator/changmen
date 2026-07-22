import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../account/player_ownership.js", () => ({
  assertPlayerOwnedByUser: vi.fn(async (playerId, userId) => {
    if (!userId)
      return { ok: false, msg: "请先登录" };
    if (Number(playerId) !== 42)
      return { ok: false, msg: "不属于当前用户" };
    return {
      ok: true,
      player: {
        id: 42,
        ownerUserId: String(userId),
        platformName: "PredictFun",
        credit: 0,
        totalBalance: 1000,
      },
    };
  }),
}));

vi.mock("../../account/account_store.js", () => ({
  updatePlayerBalance: vi.fn(async (_id, bal) => ({ total: bal })),
  getAccountsFromKv: vi.fn(() => []),
}));

vi.mock("../../account/order_store.js", () => ({
  listByPlayer: vi.fn(async () => []),
  saveOrder: vi.fn(async () => true),
  rowToOrder: (r) => ({
    OrderID: r.order_id,
    Status: r.status || "None",
    BetMoney: r.bet_money || 0,
    Money: r.money || 0,
    Odds: r.odds || 0,
    CreateAt: r.create_at || 0,
    Match: r.match || "",
    Item: r.item || "",
    Link: r.link || 0,
  }),
  resolvePfHoldSharesFromRaw: (raw) => {
    const stored = Number(raw?.pfHoldShares);
    if (stored > 0)
      return stored;
    const shares = Number(raw?.pfShares);
    if (!(shares > 0))
      return undefined;
    const type = String(raw?.pfFeeType || "").toUpperCase();
    const wei = String(raw?.pfFeeAmountWei || "").trim();
    if (type === "SHARES" && /^\d+$/.test(wei)) {
      try {
        const fee = Number(BigInt(wei)) / 1e18;
        const net = shares - fee;
        if (Number.isFinite(net) && net > 0)
          return net;
      }
      catch {
        /* ignore */
      }
    }
    return shares;
  },
}));

vi.mock("@changmen/db", () => ({
  fetchOrdersByPlayer: vi.fn(async () => []),
}));

vi.mock("../../esport-api/store.js", () => ({
  default: {
    getAccountsForUser: vi.fn(() => [{ accountId: 42, credit: 0, balance: 1000, provider: "PredictFun" }]),
    setAccountsForUser: vi.fn(async () => {}),
  },
}));

vi.mock("./house_credentials.js", () => ({
  isPredictFunHouseConfigured: () => true,
  resolvePfHouseMaxStakeUsdt: () => 500,
}));

vi.mock("./pf_api.js", () => ({
  fetchPredictMarket: vi.fn(async () => ({
    feeRateBps: 0,
    isNegRisk: false,
    isYieldBearing: false,
    status: "REGISTERED",
    tradingStatus: "OPEN",
  })),
}));

vi.mock("./pf_house_redeem.js", () => ({
  tryRedeemHouseMarketAfterSettle: vi.fn(async () => {}),
  redeemHouseResolvedPositions: vi.fn(async () => ({ ok: true, redeemed: 0, failed: 0 })),
}));

vi.mock("./pf_order_service.js", () => ({
  isValidPredictClobPrice: (v) => Number.isFinite(v) && v > 0 && v < 1,
  REUSE_BOOK_MAX_AGE_MS: 1500,
  prepareHouseSigner: vi.fn(async () => ({
    Side: {},
    orderBuilder: {},
    maker: "0xabc",
    jwt: "jwt",
  })),
  resolveExecutableBuy: vi.fn(async () => ({
    bookPrice: 0.4,
    bookOdds: 2.5,
    bookFetchedAt: Date.now(),
    feeRateBps: 200,
    isNegRisk: false,
    isYieldBearing: false,
    yesBook: { asks: [], bids: [] },
    market: {},
  })),
  createAndSubmitHouseMarketBuy: vi.fn(async () => ({
    requestBody: { data: { order: { hash: "0xhash1" } } },
    result: { success: true, data: { orderId: "ord-1", code: "ok" } },
    bookPrice: 0.4,
    bookOdds: 2.5,
    signerAddress: "0xabc",
    sharesWei: "25000000000000000000",
    shares: 25,
    makerUsdt: 10,
  })),
  createAndSubmitHouseMarketSell: vi.fn(async () => ({
    requestBody: { data: { order: { hash: "0xsell1" } } },
    result: { success: true, data: { orderId: "sell-1" } },
    bookPrice: 0.55,
    bookOdds: 1.818,
    sharesWei: "25000000000000000000",
    shares: 25,
    proceedsUsdt: 13.75,
  })),
  estimateHouseMarketBuyMakerUsdt: vi.fn(async () => ({
    makerUsdt: 10,
    shares: 25,
    sharesWei: "25000000000000000000",
    bookPrice: 0.4,
    bookOdds: 2.5,
  })),
  estimatePfSharesWei: () => 25000000000000000000n,
  weiToDecimal18: (w) => Number(BigInt(String(w))) / 1e18,
  decimal18ToWei: (n) => BigInt(Math.round(Number(n) * 1e18)),
  isPredictFunOrderAccepted: (r) => Boolean(r?.success && r?.data?.orderId),
  withHouseOrderLock: async (fn) => fn(),
}));

vi.mock("./pf_orders.js", () => ({
  fetchHousePredictOrderByHash: vi.fn(),
  fetchHousePredictOrderResolved: vi.fn(),
  waitForHouseOrderTerminal: vi.fn(async () => ({
    status: "FILLED",
    amount: "13.75",
    amountFilled: "25000000000000000000",
    order: {
      hash: "0xsell1",
      makerAmount: "25000000000000000000",
      takerAmount: "13750000000000000000",
      side: 1,
    },
  })),
  isOpenChangmenOrderStatus: (s) => {
    const v = String(s ?? "").toLowerCase();
    return v === "none" || v === "pending" || v === "";
  },
  mapPredictOrderToVenueOrder: (official, rds = {}) => ({
    provider: "PredictFun",
    orderId: String(rds.orderId || official?.order?.hash || ""),
    status: official?.status === "CANCELLED" ? "reject" : official?.status === "FILLED" ? "none" : "pending",
    odds: Number(rds.odds) || 0,
    betMoney: Number(rds.betMoney) || 0,
    money: 0,
    createAt: Number(rds.createAt) || 1,
    reward: 0,
    game: "",
    match: "",
    bet: "PredictFun",
    item: "",
  }),
  settlementFromPredictOfficialStatus: (s) => {
    const v = String(s ?? "").toUpperCase();
    if (v === "FILLED")
      return "filled";
    if (v === "CANCELLED" || v === "EXPIRED" || v === "INVALIDATED")
      return "unfilled";
    return "timeout";
  },
}));

import * as accountStore from "../../account/account_store.js";
import * as orderStore from "../../account/order_store.js";
import * as sb from "@changmen/db";
import { fetchHousePredictOrderByHash, fetchHousePredictOrderResolved } from "./pf_orders.js";
import {
  handlePfCheckBet,
  handlePfGetOrder,
  handlePfRefreshBalance,
  handlePfSubmitOrder,
  handlePfSubmitSell,
} from "./pf_client_handlers.js";

describe("pf_client_handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    orderStore.listByPlayer.mockResolvedValue([]);
    sb.fetchOrdersByPlayer.mockResolvedValue([]);
    fetchHousePredictOrderResolved.mockImplementation(async (id) => fetchHousePredictOrderByHash(id));
  });

  it("rejects when not logged in", async () => {
    const r = await handlePfCheckBet({ playerId: 42 }, null);
    expect(r.ok).toBe(false);
    expect(String(r.msg)).toMatch(/登录/);
  });

  it("rejects foreign playerId", async () => {
    const r = await handlePfCheckBet({
      playerId: 99,
      tokenId: "t",
      marketId: "1",
      apiBetMoney: 10,
      detectionMaxPrice: 0.5,
    }, "u1");
    expect(r.ok).toBe(false);
  });

  it("checkBet returns book quote", async () => {
    const r = await handlePfCheckBet({
      playerId: 42,
      tokenId: "t",
      marketId: "830202",
      apiBetMoney: 10,
      detectionMaxPrice: 0.5,
      detectionOdds: 2,
    }, "u1");
    expect(r.ok).toBe(true);
    expect(r.info.bookOdds).toBe(2.5);
    expect(r.info.playerId).toBe(42);
    expect(r.info.availableBalance).toBe(1000);
  });

  it("checkBet rejects when balance insufficient", async () => {
    const { assertPlayerOwnedByUser } = await import("../../account/player_ownership.js");
    assertPlayerOwnedByUser.mockResolvedValueOnce({
      ok: true,
      player: {
        id: 42,
        ownerUserId: "u1",
        platformName: "PredictFun",
        credit: 0,
        totalBalance: 5,
      },
    });
    const r = await handlePfCheckBet({
      playerId: 42,
      tokenId: "t",
      marketId: "1",
      apiBetMoney: 20,
      detectionMaxPrice: 0.5,
    }, "u1");
    expect(r.ok).toBe(false);
    expect(String(r.msg)).toMatch(/不足/);
  });

  it("submitOrder prefers typed-data hash as orderId and deducts balance", async () => {
    const r = await handlePfSubmitOrder({
      playerId: 42,
      tokenId: "t",
      marketId: "830202",
      apiBetMoney: 10,
      detectionMaxPrice: 0.5,
    }, "u1");
    expect(r.ok).toBe(true);
    expect(r.info.orderId).toBe("0xhash1");
    expect(r.info.pending).toBe(true);
    expect(orderStore.saveOrder).toHaveBeenCalled();
    expect(r.info.balance).toBe(990);
    expect(accountStore.updatePlayerBalance).toHaveBeenCalled();
  });

  it("getOrder refunds on CANCELLED", async () => {
    sb.fetchOrdersByPlayer.mockResolvedValue([{
      order_id: "0xhash1",
      status: "Pending",
      bet_money: 10,
      money: 0,
      odds: 2.5,
      create_at: 1,
      match: "830202",
      item: "t",
      link: 0,
      raw: { pfOrderHash: "0xhash1", pfApiOrderId: "ord-1" },
    }]);
    fetchHousePredictOrderByHash.mockResolvedValue({
      id: "ord-1",
      status: "CANCELLED",
      marketId: 830202,
      order: { hash: "0xhash1", tokenId: "t" },
      amountFilled: "0",
    });
    const r = await handlePfGetOrder({ playerId: 42, orderId: "0xhash1" }, "u1");
    expect(r.ok).toBe(true);
    expect(r.info.settlement).toBe("unfilled");
    expect(r.info.refunded).toBe(true);
    expect(accountStore.updatePlayerBalance).toHaveBeenCalled();
  });

  it("getOrder FILLED keeps user stake betMoney; records pfFillCostUsdt when known", async () => {
    sb.fetchOrdersByPlayer.mockResolvedValue([{
      order_id: "0xhash1",
      status: "Pending",
      bet_money: 10,
      money: 0,
      odds: 2.5,
      create_at: 1,
      match: "830202",
      item: "t",
      link: 0,
      raw: {
        pfOrderHash: "0xhash1",
        pfApiOrderId: "ord-1",
        pfSide: "buy",
        pfNotionalUsdt: 10,
      },
    }]);
    fetchHousePredictOrderByHash.mockResolvedValue({
      id: "ord-1",
      status: "FILLED",
      marketId: 830202,
      amount: "9.8",
      amountFilled: "25000000000000000000",
      order: {
        hash: "0xhash1",
        tokenId: "t",
        side: 0,
        makerAmount: "10000000000000000000",
        takerAmount: "25000000000000000000",
      },
    });
    accountStore.updatePlayerBalance.mockClear();
    const r = await handlePfGetOrder({ playerId: 42, orderId: "0xhash1" }, "u1");
    expect(r.ok).toBe(true);
    expect(r.info.settlement).toBe("filled");
    expect(orderStore.saveOrder).toHaveBeenCalled();
    const saved = orderStore.saveOrder.mock.calls[0][1][0];
    expect(saved.betMoney).toBe(10);
    expect(saved.pfNotionalUsdt).toBe(10);
    expect(saved.pfFillCostUsdt).toBe(9.8);
    expect(saved.pfShares).toBe(25);
    expect(accountStore.updatePlayerBalance).not.toHaveBeenCalled();
  });

  it("refreshBalance returns total_balance", async () => {
    const r = await handlePfRefreshBalance({ playerId: 42 }, "u1");
    expect(r.ok).toBe(true);
    expect(r.info.balance).toBe(1000);
    expect(r.info.credit).toBe(0);
  });

  it("checkBet rejects when notional maker exceeds balance", async () => {
    const { estimateHouseMarketBuyMakerUsdt } = await import("./pf_order_service.js");
    estimateHouseMarketBuyMakerUsdt.mockResolvedValueOnce({
      makerUsdt: 14.12,
      shares: 44,
      sharesWei: "1",
      bookPrice: 0.32,
      bookOdds: 3.125,
    });
    const { assertPlayerOwnedByUser } = await import("../../account/player_ownership.js");
    assertPlayerOwnedByUser.mockResolvedValueOnce({
      ok: true,
      player: {
        id: 42,
        ownerUserId: "u1",
        platformName: "PredictFun",
        credit: 0,
        totalBalance: 12,
      },
    });
    const r = await handlePfCheckBet({
      playerId: 42,
      tokenId: "t",
      marketId: "1",
      apiBetMoney: 10,
      detectionMaxPrice: 0.5,
    }, "u1");
    expect(r.ok).toBe(false);
    expect(String(r.msg)).toMatch(/名义/);
  });

  it("rejects over max stake", async () => {
    const r = await handlePfCheckBet({
      playerId: 42,
      tokenId: "t",
      marketId: "1",
      apiBetMoney: 9999,
      detectionMaxPrice: 0.5,
    }, "u1");
    expect(r.ok).toBe(false);
    expect(String(r.msg)).toMatch(/上限/);
  });

  it("submitSell closes buy 1:1 and credits proceeds", async () => {
    sb.fetchOrdersByPlayer.mockResolvedValue([{
      order_id: "0xbuy1",
      status: "None",
      bet_money: 10,
      money: 0,
      odds: 2.5,
      create_at: 1,
      match: "830202",
      item: "tok",
      link: 7,
      raw: {
        pfOrderHash: "0xbuy1",
        pfMarketId: "830202",
        pfTokenId: "tok",
        pfSharesWei: "25000000000000000000",
        pfShares: 25,
        pfSide: "buy",
        pfSellState: "open",
        pfBookPrice: 0.4,
      },
    }]);
    const r = await handlePfSubmitSell({ playerId: 42, buyOrderId: "0xbuy1" }, "u1");
    expect(r.ok).toBe(true);
    expect(r.info.buyOrderId).toBe("0xbuy1");
    expect(r.info.sellOrderId).toBe("0xsell1");
    expect(r.info.proceedsUsdt).toBe(13.75);
    expect(r.info.profit).toBe(3.75);
    expect(r.info.balance).toBe(1013.75);
    expect(orderStore.saveOrder).toHaveBeenCalled();
    const saved = orderStore.saveOrder.mock.calls[0][1];
    expect(saved).toHaveLength(2);
    expect(saved[0].pfSellState).toBe("closed");
    expect(saved[0].money).toBe(3.75);
    expect(saved[0].pfSellProceeds).toBe(13.75);
    expect(saved[1].pfSide).toBe("sell");
    expect(saved[1].pfBuyOrderId).toBe("0xbuy1");
    // 卖单 betMoney = 回款镜像（订单栏展示）；money 恒 0
    expect(saved[1].betMoney).toBe(13.75);
    expect(saved[1].money).toBe(0);
  });

  it("submitSell uses hold shares not gross when SHARES fee present", async () => {
    const { createAndSubmitHouseMarketSell } = await import("./pf_order_service.js");
    createAndSubmitHouseMarketSell.mockClear();
    sb.fetchOrdersByPlayer.mockResolvedValue([{
      order_id: "0xbuy1",
      status: "None",
      bet_money: 14.12,
      money: 0,
      odds: 3.125,
      create_at: 1,
      match: "830202",
      item: "tok",
      link: 7,
      raw: {
        pfOrderHash: "0xbuy1",
        pfMarketId: "830202",
        pfTokenId: "tok",
        pfSharesWei: "44125000000000000000",
        pfShares: 44.125,
        pfHoldShares: 43.33075,
        pfFeeType: "SHARES",
        pfFeeAmountWei: "794250000000000000",
        pfSide: "buy",
        pfSellState: "open",
        pfBookPrice: 0.32,
      },
    }]);
    const r = await handlePfSubmitSell({ playerId: 42, buyOrderId: "0xbuy1" }, "u1");
    expect(r.ok).toBe(true);
    expect(createAndSubmitHouseMarketSell).toHaveBeenCalled();
    const soldWei = BigInt(String(createAndSubmitHouseMarketSell.mock.calls[0][0].sharesWei));
    expect(soldWei).toBe(BigInt(Math.round(43.33075 * 1e18)));
    expect(soldWei < 44125000000000000000n).toBe(true);
  });

  it("submitSell refuses when SHARES fee present but hold cannot be resolved", async () => {
    sb.fetchOrdersByPlayer.mockResolvedValue([{
      order_id: "0xbuy1",
      status: "None",
      bet_money: 14.12,
      money: 0,
      odds: 3.125,
      create_at: 1,
      match: "830202",
      item: "tok",
      raw: {
        pfOrderHash: "0xbuy1",
        pfMarketId: "830202",
        pfTokenId: "tok",
        // 仅毛份额 wei，无 pfShares / hold → 有手续费时不得回退毛份额
        pfSharesWei: "44125000000000000000",
        pfFeeType: "SHARES",
        pfFeeAmountWei: "794250000000000000",
        pfSide: "buy",
        pfSellState: "open",
      },
    }]);
    const r = await handlePfSubmitSell({ playerId: 42, buyOrderId: "0xbuy1" }, "u1");
    expect(r.ok).toBe(false);
    expect(String(r.msg)).toMatch(/净持仓/);
  });

  it("submitSell does not credit when official status is not FILLED", async () => {
    const { waitForHouseOrderTerminal } = await import("./pf_orders.js");
    waitForHouseOrderTerminal.mockResolvedValueOnce({ status: "CANCELLED" });
    sb.fetchOrdersByPlayer.mockResolvedValue([{
      order_id: "0xbuy1",
      status: "None",
      bet_money: 10,
      money: 0,
      odds: 2.5,
      create_at: 1,
      match: "830202",
      item: "tok",
      raw: {
        pfOrderHash: "0xbuy1",
        pfMarketId: "830202",
        pfTokenId: "tok",
        pfSharesWei: "25000000000000000000",
        pfSide: "buy",
        pfSellState: "open",
      },
    }]);
    const r = await handlePfSubmitSell({ playerId: 42, buyOrderId: "0xbuy1" }, "u1");
    expect(r.ok).toBe(false);
    expect(String(r.msg)).toMatch(/未成交/);
    expect(orderStore.saveOrder).not.toHaveBeenCalled();
    expect(accountStore.updatePlayerBalance).not.toHaveBeenCalled();
  });
});
