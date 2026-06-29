import type { PlatformAccount } from "@/models/platformAccount";
import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { polymarketProvider } from "./bet";
import { POLYMARKET_BUILDER_CODE_DEFAULT } from "./builder";
import { POLYMARKET_CLOB_API } from "./api";
import { polymarketPluginGet, polymarketPluginPost } from "./transport";

vi.mock("./transport", () => ({
  polymarketPluginGet: vi.fn(),
  polymarketPluginPost: vi.fn(),
}));

function accountWithToken(token: string): PlatformAccount {
  return {
    provider: "Polymarket",
    gateway: POLYMARKET_CLOB_API,
    token,
  } as unknown as PlatformAccount;
}

function base64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function expectedL2Signature(secret: string, message: string): string {
  return createHmac("sha256", Buffer.from(secret, "base64"))
    .update(message)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

describe("polymarketProvider.getBalance", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(polymarketPluginGet).mockReset();
    vi.mocked(polymarketPluginPost).mockReset();
  });

  test("uses L2 headers to fetch collateral balance", async () => {
    vi.mocked(polymarketPluginGet).mockResolvedValue({ balance: "123450000", allowance: "999999999" });
    const account = accountWithToken(JSON.stringify({
      walletAddress: "0xabc",
      signatureType: 3,
      apiCreds: {
        apiKey: "key-1",
        secret: "c2VjcmV0",
        passphrase: "pass-1",
      },
    }));

    await expect(polymarketProvider.getBalance!(account)).resolves.toEqual({
      balance: 123.45,
      currency: "USDT",
    });

    expect(polymarketPluginGet).toHaveBeenCalledOnce();
    const [url, options] = vi.mocked(polymarketPluginGet).mock.calls[0]!;
    expect(url).toBe(`${POLYMARKET_CLOB_API}/balance-allowance?asset_type=COLLATERAL&signature_type=3`);
    expect(options?.headers).toMatchObject({
      POLY_ADDRESS: "0xabc",
      POLY_API_KEY: "key-1",
      POLY_PASSPHRASE: "pass-1",
    });
    expect(options?.headers?.POLY_SIGNATURE).toEqual(expect.any(String));
    expect(options?.headers?.POLY_TIMESTAMP).toEqual(expect.any(String));
  });

  test("accepts full base64 data copied from plugin", async () => {
    vi.mocked(polymarketPluginGet).mockResolvedValue({ balance: "1000000" });
    const payload = {
      walletAddress: "0xdef",
      apiCreds: {
        key: "key-2",
        secret: "c2VjcmV0",
        passphrase: "pass-2",
      },
    };
    const account = accountWithToken(base64Utf8(JSON.stringify(payload)));

    await expect(polymarketProvider.getBalance!(account)).resolves.toEqual({
      balance: 1,
      currency: "USDT",
    });
  });

  test("accepts outer plugin payload with nested token json", async () => {
    vi.mocked(polymarketPluginGet).mockResolvedValue({ balance: "4868613" });
    const nested = {
      walletAddress: "0xCa4c007bdc8087F13141046Dc38F2f79F87cf43e",
      funder: "0x8ed24e533d24c2f381983eda8f97c2358f8d65e5",
      signatureType: "1",
      apiCreds: {
        apiKey: "key-nested",
        secret: "c2VjcmV0",
        passphrase: "pass-nested",
      },
    };
    const account = accountWithToken(base64Utf8(JSON.stringify({
      provider: "Polymarket",
      gateway: POLYMARKET_CLOB_API,
      referer: "https://polymarket.com/zh",
      token: JSON.stringify(nested),
    })));

    await expect(polymarketProvider.getBalance!(account)).resolves.toEqual({
      balance: 4.868613,
      currency: "USDT",
    });

    const [url, options] = vi.mocked(polymarketPluginGet).mock.calls[0]!;
    expect(url).toBe(`${POLYMARKET_CLOB_API}/balance-allowance?asset_type=COLLATERAL&signature_type=3`);
    expect(options?.headers).toMatchObject({
      POLY_ADDRESS: nested.walletAddress,
      POLY_API_KEY: "key-nested",
      POLY_PASSPHRASE: "pass-nested",
    });
  });

  test("accepts flat official api credential json", async () => {
    vi.mocked(polymarketPluginGet).mockResolvedValue({ balance: "2500000" });
    const account = accountWithToken(JSON.stringify({
      address: "0x123",
      key: "key-flat",
      secret: "c2VjcmV0",
      passphrase: "pass-flat",
    }));

    await expect(polymarketProvider.getBalance!(account)).resolves.toEqual({
      balance: 2.5,
      currency: "USDT",
    });
    const [, options] = vi.mocked(polymarketPluginGet).mock.calls[0]!;
    expect(options?.headers).toMatchObject({
      POLY_ADDRESS: "0x123",
      POLY_API_KEY: "key-flat",
      POLY_PASSPHRASE: "pass-flat",
    });
  });

  test("accepts apiSecret naming from captured storage", async () => {
    vi.mocked(polymarketPluginGet).mockResolvedValue({ balance: "3000000" });
    const account = accountWithToken(JSON.stringify({
      walletAddress: "0x456",
      apiCreds: {
        apiKey: "key-camel",
        apiSecret: "c2VjcmV0",
        passphrase: "pass-camel",
      },
    }));

    await expect(polymarketProvider.getBalance!(account)).resolves.toEqual({
      balance: 3,
      currency: "USDT",
    });
    const [, options] = vi.mocked(polymarketPluginGet).mock.calls[0]!;
    expect(options?.headers).toMatchObject({
      POLY_ADDRESS: "0x456",
      POLY_API_KEY: "key-camel",
      POLY_PASSPHRASE: "pass-camel",
    });
  });

  test("signs the endpoint path without query params like the official client", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    vi.mocked(polymarketPluginGet).mockResolvedValue({ balance: "1000000" });
    const account = accountWithToken(JSON.stringify({
      walletAddress: "0xabc",
      signatureType: 3,
      apiCreds: {
        apiKey: "key-1",
        secret: "c2VjcmV0",
        passphrase: "pass-1",
      },
    }));

    await polymarketProvider.getBalance!(account);

    const [url, options] = vi.mocked(polymarketPluginGet).mock.calls[0]!;
    expect(url).toBe(`${POLYMARKET_CLOB_API}/balance-allowance?asset_type=COLLATERAL&signature_type=3`);
    expect(options?.headers?.POLY_SIGNATURE).toBe(
      expectedL2Signature("c2VjcmV0", "1700000000GET/balance-allowance"),
    );
  });

  test("uses POLY_1271 directly when wallet and funder differ without explicit signature type", async () => {
    vi.mocked(polymarketPluginGet).mockResolvedValueOnce({ balance: "4868613" });
    const account = accountWithToken(JSON.stringify({
      walletAddress: "0xCa4c007bdc8087F13141046Dc38F2f79F87cf43e",
      funder: "0x8ed24e533d24c2f381983eda8f97c2358f8d65e5",
      apiCreds: {
        apiKey: "key-1",
        secret: "c2VjcmV0",
        passphrase: "pass-1",
      },
    }));

    await expect(polymarketProvider.getBalance!(account)).resolves.toEqual({
      balance: 4.868613,
      currency: "USDT",
    });

    expect(vi.mocked(polymarketPluginGet).mock.calls.map(([url]) => url)).toEqual([
      `${POLYMARKET_CLOB_API}/balance-allowance?asset_type=COLLATERAL&signature_type=3`,
    ]);
  });

  test("overrides captured proxy signature type when funder differs from wallet", async () => {
    vi.mocked(polymarketPluginGet).mockResolvedValueOnce({ balance: "4868613" });
    const account = accountWithToken(JSON.stringify({
      walletAddress: "0xCa4c007bdc8087F13141046Dc38F2f79F87cf43e",
      funder: "0x8ed24e533d24c2f381983eda8f97c2358f8d65e5",
      signatureType: "1",
      apiCreds: {
        apiKey: "key-1",
        secret: "c2VjcmV0",
        passphrase: "pass-1",
      },
    }));

    await expect(polymarketProvider.getBalance!(account)).resolves.toEqual({
      balance: 4.868613,
      currency: "USDT",
    });

    expect(vi.mocked(polymarketPluginGet)).toHaveBeenCalledOnce();
    const [url] = vi.mocked(polymarketPluginGet).mock.calls[0]!;
    expect(url).toBe(`${POLYMARKET_CLOB_API}/balance-allowance?asset_type=COLLATERAL&signature_type=3`);
  });

  test("infers POLY_1271 signature type when funder differs from wallet", async () => {
    vi.mocked(polymarketPluginGet).mockResolvedValue({ balance: "1000000" });
    const account = accountWithToken(JSON.stringify({
      walletAddress: "0xabc",
      funder: "0xproxy",
      apiCreds: {
        apiKey: "key-1",
        secret: "c2VjcmV0",
        passphrase: "pass-1",
      },
    }));

    await polymarketProvider.getBalance!(account);

    const [url] = vi.mocked(polymarketPluginGet).mock.calls[0]!;
    expect(url).toBe(`${POLYMARKET_CLOB_API}/balance-allowance?asset_type=COLLATERAL&signature_type=3`);
  });

  test("returns undefined when api secret is missing", async () => {
    const account = accountWithToken(JSON.stringify({
      walletAddress: "0xabc",
      apiCreds: { apiKey: "key-1", passphrase: "pass-1" },
    }));

    await expect(polymarketProvider.getBalance!(account)).resolves.toBeUndefined();
    expect(polymarketPluginGet).not.toHaveBeenCalled();
  });
});

describe("polymarketProvider.betting", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(polymarketPluginGet).mockReset();
    vi.mocked(polymarketPluginPost).mockReset();
  });

  test("uses official CLOB v2 order shape and posts through plugin", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    vi.mocked(polymarketPluginGet).mockResolvedValueOnce({
      tick_size: "0.01",
      min_order_size: "1",
      neg_risk: false,
      asks: [{ price: "0.5", size: "10" }],
    });
    vi.mocked(polymarketPluginPost).mockResolvedValueOnce({
      success: true,
      orderID: "order-1",
      status: "matched",
      takingAmount: "2000000",
      makingAmount: "1000000",
    });

    const account = accountWithToken(JSON.stringify({
      walletAddress: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
      funder: "0x8ed24e533d24c2f381983eda8f97c2358f8d65e5",
      signatureType: "3",
      privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
      apiCreds: {
        apiKey: "key-1",
        secret: "c2VjcmV0",
        passphrase: "pass-1",
      },
    }));
    const option = {
      itemId: "123456789",
      odds: 2,
      betMoney: 1,
    };

    const result = await polymarketProvider.betting!(account, option as any);

    expect(result.success).toBe(true);
    expect(polymarketPluginGet).toHaveBeenCalledWith(`${POLYMARKET_CLOB_API}/book?token_id=123456789`);
    expect(polymarketPluginPost).toHaveBeenCalledOnce();

    const [url, body, options] = vi.mocked(polymarketPluginPost).mock.calls[0]!;
    expect(url).toBe(`${POLYMARKET_CLOB_API}/order`);
    expect(body).toMatchObject({
      owner: "key-1",
      orderType: "FOK",
      deferExec: false,
      postOnly: false,
      order: {
        maker: "0x8ed24e533d24c2f381983eda8f97c2358f8d65e5",
        signer: "0x8ed24e533d24c2f381983eda8f97c2358f8d65e5",
        tokenId: "123456789",
        makerAmount: "1000000",
        takerAmount: "2000000",
        side: "BUY",
        signatureType: 3,
        timestamp: "1700000000000",
        expiration: "0",
        metadata: "0x0000000000000000000000000000000000000000000000000000000000000000",
        builder: POLYMARKET_BUILDER_CODE_DEFAULT,
      },
    });
    expect((body as any).order.signature).toEqual(expect.stringMatching(/^0x[0-9a-f]+$/));
    expect(options?.headers).toMatchObject({
      POLY_ADDRESS: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
      POLY_API_KEY: "key-1",
      POLY_PASSPHRASE: "pass-1",
    });
    expect(options?.headers?.POLY_BUILDER_API_KEY).toBeUndefined();
    expect(options?.headers?.POLY_BUILDER_SIGNATURE).toBeUndefined();
    expect(options?.headers?.POLY_SIGNATURE).toBe(
      expectedL2Signature("c2VjcmV0", `1700000000POST/order${JSON.stringify(body)}`),
    );
  });

  test("uses market order price from book depth for FOK buy amount", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    vi.mocked(polymarketPluginGet).mockResolvedValueOnce({
      tick_size: "0.01",
      min_order_size: "5",
      neg_risk: false,
      asks: [
        { price: "0.5", size: "5" },
        { price: "0.55", size: "20" },
      ],
    });
    vi.mocked(polymarketPluginPost).mockResolvedValueOnce({
      success: true,
      orderID: "order-depth",
      status: "matched",
      takingAmount: "18181900",
      makingAmount: "10000000",
    });

    const account = accountWithToken(JSON.stringify({
      walletAddress: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
      funder: "0x8ed24e533d24c2f381983eda8f97c2358f8d65e5",
      signatureType: "3",
      privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
      apiCreds: {
        apiKey: "key-1",
        secret: "c2VjcmV0",
        passphrase: "pass-1",
      },
    }));
    const option = {
      itemId: "123456789",
      odds: 2,
      betMoney: 10,
    };

    const result = await polymarketProvider.betting!(account, option as any);

    expect(result.success).toBe(true);
    expect((option as any).newOdds).toBeCloseTo(1.8182, 4);

    const [, body] = vi.mocked(polymarketPluginPost).mock.calls[0]!;
    expect(body).toMatchObject({
      orderType: "FOK",
      order: {
        makerAmount: "10000000",
        takerAmount: "18181800",
        side: "BUY",
      },
    });
  });

  test("reports minimum order size before posting too-small FOK buy", async () => {
    vi.mocked(polymarketPluginGet).mockResolvedValueOnce({
      tick_size: "0.01",
      min_order_size: "5",
      neg_risk: false,
      asks: [{ price: "0.78", size: "100" }],
    });

    const account = accountWithToken(JSON.stringify({
      walletAddress: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
      funder: "0x8ed24e533d24c2f381983eda8f97c2358f8d65e5",
      signatureType: "3",
      privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
      apiCreds: {
        apiKey: "key-1",
        secret: "c2VjcmV0",
        passphrase: "pass-1",
      },
    }));

    const result = await polymarketProvider.betting!(account, {
      itemId: "123456789",
      odds: 1.2821,
      betMoney: 3,
    } as any);

    expect(result.success).toBe(false);
    expect(result.message).toContain("Polymarket 下单金额低于最小份数");
    expect(result.message).toContain("【盘口】");
    expect(result.message).toContain("最小下单份数：5");
    expect(result.message).toContain("当前盘口至少约 3.9 USDC");
    expect(polymarketPluginPost).not.toHaveBeenCalled();
  });
});

describe("polymarketProvider.checkBet", () => {
  test("temporarily marks option.data so A8 precheck gate passes", async () => {
    const option = {
      itemId: "123456789",
      odds: 2,
      betMoney: 10,
    };

    const out = await polymarketProvider.checkBet(
      accountWithToken("{}"),
      option as any,
    );

    expect(out.data).toEqual({
      tokenId: "123456789",
      odds: 2,
      betMoney: 10,
      side: "BUY",
      temporaryPass: true,
    });
  });
});

describe("polymarketProvider.getOrders", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(polymarketPluginGet).mockReset();
  });

  test("fetches trades with L2 auth and maps to venue orders", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_100_000_000);
    vi.mocked(polymarketPluginGet).mockImplementation(async (url: string) => {
      if (url.includes("/data/trades")) {
        return {
          data: [{
            taker_order_id: "0xtrade-order",
            market: "0xcondition",
            side: "BUY",
            status: "TRADE_STATUS_CONFIRMED",
            size: "2000000",
            price: "0.5",
            match_time: "1700000000",
            outcome: "Team A",
          }],
          next_cursor: "LTE=",
        };
      }
      if (url.includes("gamma-api.polymarket.com/markets")) {
        return [{
          condition_id: "0xcondition",
          question: "Counter-Strike: Team A vs Team B",
          sports_market_type: "child_moneyline",
          group_item_title: "Map 1 Winner",
          tags: [{ label: "cs2" }],
        }];
      }
      throw new Error(`unexpected url ${url}`);
    });

    const account = accountWithToken(JSON.stringify({
      walletAddress: "0xabc",
      apiCreds: {
        apiKey: "key-1",
        secret: "c2VjcmV0",
        passphrase: "pass-1",
      },
    }));

    const orders = await polymarketProvider.getOrders!(account);
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({
      provider: "Polymarket",
      orderId: "0xtrade-order",
      status: "none",
      betMoney: 1,
      odds: 2,
    });

    const tradesCall = vi.mocked(polymarketPluginGet).mock.calls.find(([url]) => url.includes("/data/trades"));
    expect(tradesCall?.[0]).toContain("/data/trades?after=");
    expect(tradesCall?.[1]?.headers).toMatchObject({
      POLY_ADDRESS: "0xabc",
      POLY_API_KEY: "key-1",
      POLY_PASSPHRASE: "pass-1",
    });
    expect(tradesCall?.[1]?.headers?.POLY_SIGNATURE).toBe(
      expectedL2Signature("c2VjcmV0", "1700100000GET/data/trades"),
    );
  });

  test("returns empty array when credentials are missing", async () => {
    const orders = await polymarketProvider.getOrders!(accountWithToken("{}"));
    expect(orders).toEqual([]);
    expect(polymarketPluginGet).not.toHaveBeenCalled();
  });
});
