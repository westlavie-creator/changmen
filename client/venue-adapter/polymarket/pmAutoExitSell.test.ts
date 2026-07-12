import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./transport", () => ({
  polymarketPluginGet: vi.fn(),
  polymarketPluginPost: vi.fn(),
}));

vi.mock("./pmClientApi", () => ({
  pmGetBook: vi.fn(),
  pmGetOpenOrders: vi.fn(),
  pmSubmitOrder: vi.fn(),
}));

vi.mock("./l2Auth", () => ({
  parseTokenConfig: vi.fn(() => ({})),
  resolveApiCreds: vi.fn(() => ({
    address: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
    apiKey: "key-1",
    secret: "c2VjcmV0",
    passphrase: "pass-1",
    signatureType: 3,
  })),
  resolvePrivateKey: vi.fn(() => "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"),
  resolveFunder: vi.fn(() => "0x8ed24e533d24c2f381983eda8f97c2358f8d65e5"),
  buildL2Headers: vi.fn(async () => ({})),
}));

vi.mock("./pmHeartbeat", () => ({
  ensurePolymarketHeartbeat: vi.fn(),
}));

vi.mock("./builder", () => ({
  resolvePolymarketBuilderCode: () =>
    "0x58ec38dac8719b354dfd2a47d6ac27ab01babea9102a993c1abe4af30ec2883f",
}));

import { pmGetBook, pmGetOpenOrders, pmSubmitOrder } from "./pmClientApi";
import { ensurePolymarketHeartbeat } from "./pmHeartbeat";
import {
  clearPolymarketAutoExitSellScheduleForTests,
  placePolymarketAutoExitSell,
} from "./pmAutoExitSell";

describe("placePolymarketAutoExitSell", () => {
  beforeEach(() => {
    clearPolymarketAutoExitSellScheduleForTests();
    vi.mocked(pmGetBook).mockReset();
    vi.mocked(pmGetOpenOrders).mockReset();
    vi.mocked(pmSubmitOrder).mockReset();
  });

  it("posts GTC SELL at tick-aligned price from book tick_size", async () => {
    vi.mocked(pmGetOpenOrders).mockResolvedValueOnce([]);
    vi.mocked(pmGetBook).mockResolvedValueOnce({
      tick_size: "0.01",
      min_order_size: "1",
      neg_risk: false,
    });
    vi.mocked(pmSubmitOrder).mockResolvedValueOnce({
      success: true,
      orderID: "sell-1",
      status: "live",
    });

    const account = {
      accountId: 1,
      gateway: "https://clob.polymarket.com",
      token: "{}",
    } as any;

    const out = await placePolymarketAutoExitSell({
      account,
      buyOrderId: "buy-1",
      tokenId: "123456789",
      shares: 10,
    });

    expect(out.ok).toBe(true);
    expect(out.price).toBe(0.99);
    expect(out.sellOrderId).toBe("sell-1");
    expect(out.tickSize).toBe("0.01");
    expect(ensurePolymarketHeartbeat).toHaveBeenCalled();

    const openOrdersCall = vi.mocked(pmGetOpenOrders).mock.calls[0]!;
    expect(openOrdersCall[1]).toBe("123456789");

    const [, body] = vi.mocked(pmSubmitOrder).mock.calls[0]!;
    expect(body).toMatchObject({
      orderType: "GTC",
      order: {
        side: "SELL",
        tokenId: "123456789",
      },
    });
  });

  it("is idempotent per buyOrderId", async () => {
    vi.mocked(pmSubmitOrder).mockResolvedValue({
      success: true,
      orderID: "sell-1",
      status: "live",
    });

    const account = { accountId: 1, gateway: "https://clob.polymarket.com", token: "{}" } as any;
    vi.mocked(pmGetOpenOrders).mockResolvedValueOnce([]);
    vi.mocked(pmGetBook).mockResolvedValueOnce({
      tick_size: "0.01",
      min_order_size: "1",
      neg_risk: false,
    });

    const first = await placePolymarketAutoExitSell({
      account,
      buyOrderId: "buy-dup",
      tokenId: "123456789",
      shares: 5,
    });
    const second = await placePolymarketAutoExitSell({
      account,
      buyOrderId: "buy-dup",
      tokenId: "123456789",
      shares: 5,
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    expect(second.error).toMatch(/已挂过/);
  });

  it("skips placing when an open SELL already exists for the token", async () => {
    vi.mocked(pmGetOpenOrders).mockResolvedValueOnce({
      data: [{
        id: "sell-existing",
        asset_id: "123456789",
        side: "SELL",
        status: "ORDER_STATUS_LIVE",
        original_size: "5",
        size_matched: "0",
        price: "0.99",
      }],
    });

    const account = { accountId: 1, gateway: "https://clob.polymarket.com", token: "{}" } as any;
    const out = await placePolymarketAutoExitSell({
      account,
      buyOrderId: "buy-refresh",
      tokenId: "123456789",
      shares: 5,
    });

    expect(out.ok).toBe(true);
    expect(out.skippedDuplicate).toBe(true);
    expect(out.sellOrderId).toBe("sell-existing");
    expect(pmSubmitOrder).not.toHaveBeenCalled();
  });
});

describe("isPolymarketAutoExitSellEnabled", () => {
  it("defaults to enabled", async () => {
    const { isPolymarketAutoExitSellEnabled, schedulePolymarketAutoExitSellAfterBuy } = await import("./pmAutoExitSell");
    expect(isPolymarketAutoExitSellEnabled(undefined)).toBe(true);
    expect(isPolymarketAutoExitSellEnabled(true)).toBe(true);
    expect(isPolymarketAutoExitSellEnabled(false)).toBe(false);

    schedulePolymarketAutoExitSellAfterBuy({
      account: { accountId: 1, gateway: "https://clob.polymarket.com", token: "{}" } as any,
      buyOrderId: "buy-off",
      tokenId: "123",
      buyResponse: { takingAmount: "5", makingAmount: "4.95" },
      enabled: false,
    });
    expect(pmSubmitOrder).not.toHaveBeenCalled();
  });
});
