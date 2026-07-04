import type { PlatformAccount } from "@/models/platformAccount";
import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { isPolymarketFokBuyFilled, isPolymarketOrderAccepted, polymarketProvider } from "./bet";
import { POLYMARKET_BUILDER_CODE_DEFAULT } from "./builder";
import { POLYMARKET_CLOB_API } from "./api";
import { polymarketPluginGet, polymarketPluginPost } from "./transport";

vi.mock("./transport", () => ({
  polymarketPluginGet: vi.fn(),
  polymarketPluginPost: vi.fn(),
}));

function accountWithToken(token: string, extra: Partial<PlatformAccount> = {}): PlatformAccount {
  return {
    provider: "Polymarket",
    gateway: POLYMARKET_CLOB_API,
    token,
    ...extra,
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

function mockPluginGetWithBook(
  book: Record<string, unknown>,
  tokenId = "123456789",
) {
  vi.mocked(polymarketPluginGet).mockImplementation(async (url: string) => {
    if (url.includes("gamma-api.polymarket.com/markets")) {
      return [{
        clob_token_ids: JSON.stringify([tokenId]),
        outcomePrices: JSON.stringify(["0.5", "0.5"]),
      }];
    }
    if (url.includes("/book"))
      return book;
    throw new Error(`unexpected url ${url}`);
  });
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

  test("returns raw USDC balance (CNY via getExchange on account)", async () => {
    vi.mocked(polymarketPluginGet).mockResolvedValue({ balance: "123450000" });
    const account = accountWithToken(JSON.stringify({
      walletAddress: "0xabc",
      signatureType: 3,
      apiCreds: {
        apiKey: "key-1",
        secret: "c2VjcmV0",
        passphrase: "pass-1",
      },
    }), { multiply: 10 });

    await expect(polymarketProvider.getBalance!(account)).resolves.toEqual({
      balance: 123.45,
      currency: "USDT",
    });
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
    mockPluginGetWithBook({
      tick_size: "0.01",
      min_order_size: "1",
      neg_risk: false,
      asks: [{ price: "0.5", size: "100" }],
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
      betMoney: 10,
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
        makerAmount: "10000000",
        takerAmount: "20000000",
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
    mockPluginGetWithBook({
      tick_size: "0.01",
      min_order_size: "5",
      neg_risk: false,
      asks: [
        { price: "0.5", size: "50" },
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
    expect((option as any).newOdds).toBeCloseTo(2, 4);

    const [, body] = vi.mocked(polymarketPluginPost).mock.calls[0]!;
    expect(body).toMatchObject({
      orderType: "FOK",
      order: {
        makerAmount: "10000000",
        takerAmount: "20000000",
        side: "BUY",
      },
    });
  });

  test("rejects FOK when book price exceeds detection odds cap", async () => {
    mockPluginGetWithBook({
      tick_size: "0.01",
      min_order_size: "5",
      neg_risk: false,
      asks: [{ price: "0.32", size: "100" }],
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
      odds: 3.125,
      betMoney: 35,
      data: { detectionOdds: 5, apiBetMoney: 5 },
    } as any);

    expect(result.success).toBe(false);
    expect(result.message).toContain("盘口价高于检测价");
    expect(polymarketPluginPost).not.toHaveBeenCalled();
  });

  test("accepts FOK when fo clobPrice matches book despite display odds rounding", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    mockPluginGetWithBook({
      tick_size: "0.01",
      min_order_size: "5",
      neg_risk: false,
      asks: [{ price: "0.68", size: "5000" }],
    });
    vi.mocked(polymarketPluginPost).mockResolvedValueOnce({
      success: true,
      orderID: "order-rounding",
      status: "matched",
      takingAmount: "7350000",
      makingAmount: "5000000",
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
      odds: 1.471,
      betMoney: 35,
      data: {
        detectionOdds: 1.471,
        detectionClobPrice: 0.68,
        apiBetMoney: 5,
      },
    } as any);

    expect(result.success).toBe(true);
    expect(polymarketPluginPost).toHaveBeenCalledOnce();
  });

  test("uses current betMoney instead of stale apiBetMoney after reconcile", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    mockPluginGetWithBook({
      tick_size: "0.01",
      min_order_size: "1",
      neg_risk: false,
      asks: [{ price: "0.38", size: "5000" }],
    });
    vi.mocked(polymarketPluginPost).mockResolvedValueOnce({
      success: true,
      orderID: "order-reconcile-stake",
      status: "matched",
      takingAmount: "2630000",
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

    const result = await polymarketProvider.betting!(account, {
      itemId: "123456789",
      odds: 2.632,
      betMoney: 3,
      data: {
        detectionOdds: 2.631,
        detectionClobPrice: 0.38,
        apiBetMoney: 14,
      },
    } as any);

    expect(result.success).toBe(true);
    const [, body] = vi.mocked(polymarketPluginPost).mock.calls[0]!;
    expect(Number((body as { order: { makerAmount: string } }).order.makerAmount) / 1_000_000)
      .toBeCloseTo(3, 2);
  });

  test("ignores stale apiBetMoney when betMoney is zero", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    mockPluginGetWithBook({
      tick_size: "0.01",
      min_order_size: "1",
      neg_risk: false,
      asks: [{ price: "0.38", size: "5000" }],
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
      odds: 2.632,
      betMoney: 0,
      data: {
        detectionOdds: 2.631,
        detectionClobPrice: 0.38,
        apiBetMoney: 14,
      },
    } as any);

    expect(result.success).toBe(false);
    expect(polymarketPluginPost).not.toHaveBeenCalled();
  });

  test("reports minimum order size before posting too-small FOK buy", async () => {
    mockPluginGetWithBook({
      tick_size: "0.01",
      min_order_size: "12",
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
    expect(result.message).toContain("最小下单份数：12");
    expect(result.message).toContain("当前盘口至少约 9.36 USDC");
    expect(polymarketPluginPost).not.toHaveBeenCalled();
  });

  test("fails when API success but status is not matched", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    mockPluginGetWithBook({
      tick_size: "0.01",
      min_order_size: "1",
      neg_risk: false,
      asks: [{ price: "0.5", size: "100" }],
    });
    vi.mocked(polymarketPluginPost).mockResolvedValueOnce({
      success: true,
      orderID: "order-unmatched",
      status: "unmatched",
      takingAmount: "",
    });

    const account = accountWithToken(JSON.stringify({
      walletAddress: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
      funder: "0x8ed24e533d24c2f381983eda8f97c2358f8d65e5",
      signatureType: "3",
      privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
      apiCreds: { apiKey: "key-1", secret: "c2VjcmV0", passphrase: "pass-1" },
    }));

    const result = await polymarketProvider.betting!(account, {
      itemId: "123456789",
      odds: 2,
      betMoney: 10,
    } as any);

    expect(result.success).toBe(false);
    expect(result.message).toContain("status: unmatched");
    expect(result.message).toContain("未成交");
  });

  test("succeeds when API returns delayed with orderID (chain pending)", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    mockPluginGetWithBook({
      tick_size: "0.01",
      min_order_size: "1",
      neg_risk: false,
      asks: [{ price: "0.5", size: "100" }],
    });
    vi.mocked(polymarketPluginPost).mockResolvedValueOnce({
      success: true,
      orderID: "0xdelayed-order",
      status: "delayed",
      takingAmount: "",
    });

    const account = accountWithToken(JSON.stringify({
      walletAddress: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
      funder: "0x8ed24e533d24c2f381983eda8f97c2358f8d65e5",
      signatureType: "3",
      privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
      apiCreds: { apiKey: "key-1", secret: "c2VjcmV0", passphrase: "pass-1" },
    }));

    const result = await polymarketProvider.betting!(account, {
      itemId: "123456789",
      odds: 2,
      betMoney: 10,
    } as any);

    expect(result.success).toBe(true);
    expect(result.pending).toBe(true);
    expect(result.orderId).toBe("0xdelayed-order");
    expect(result.message).toContain("待确认");
  });

  test("fails when matched but takingAmount is zero", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    mockPluginGetWithBook({
      tick_size: "0.01",
      min_order_size: "1",
      neg_risk: false,
      asks: [{ price: "0.5", size: "100" }],
    });
    vi.mocked(polymarketPluginPost).mockResolvedValueOnce({
      success: true,
      orderID: "order-empty",
      status: "matched",
      takingAmount: "0",
    });

    const account = accountWithToken(JSON.stringify({
      walletAddress: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
      funder: "0x8ed24e533d24c2f381983eda8f97c2358f8d65e5",
      signatureType: "3",
      privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
      apiCreds: { apiKey: "key-1", secret: "c2VjcmV0", passphrase: "pass-1" },
    }));

    const result = await polymarketProvider.betting!(account, {
      itemId: "123456789",
      odds: 2,
      betMoney: 10,
    } as any);

    expect(result.success).toBe(false);
    expect(result.message).toContain("takingAmount: 0");
  });
});

describe("isPolymarketFokBuyFilled", () => {
  test("requires success, matched status, and positive takingAmount", () => {
    expect(isPolymarketFokBuyFilled({
      success: true,
      status: "matched",
      takingAmount: "2000000",
    })).toBe(true);
    expect(isPolymarketFokBuyFilled({
      success: true,
      status: "MATCHED",
      takingAmount: "1.5",
    })).toBe(true);
    expect(isPolymarketFokBuyFilled({
      success: true,
      status: "delayed",
      takingAmount: "100",
    })).toBe(false);
    expect(isPolymarketFokBuyFilled({
      success: false,
      status: "matched",
      takingAmount: "100",
    })).toBe(false);
    expect(isPolymarketFokBuyFilled({
      success: true,
      status: "matched",
      takingAmount: "",
    })).toBe(false);
  });
});

describe("isPolymarketOrderAccepted", () => {
  test("accepts matched fills and delayed submissions with orderID", () => {
    expect(isPolymarketOrderAccepted({
      success: true,
      status: "matched",
      takingAmount: "1",
      orderID: "0x1",
    })).toBe(true);
    expect(isPolymarketOrderAccepted({
      success: true,
      status: "delayed",
      orderID: "0xdelayed",
    })).toBe(true);
    expect(isPolymarketOrderAccepted({
      success: true,
      status: "delayed",
      orderID: "",
    })).toBe(false);
    expect(isPolymarketOrderAccepted({
      success: true,
      status: "unmatched",
      orderID: "0x2",
    })).toBe(false);
  });
});

describe("polymarketProvider.checkBet", () => {
  beforeEach(() => {
    vi.mocked(polymarketPluginGet).mockReset();
    vi.mocked(polymarketPluginGet).mockImplementation(async (url: string) => {
      if (url.includes("gamma-api.polymarket.com/markets")) {
        return [{
          clob_token_ids: JSON.stringify(["123456789"]),
          outcomePrices: JSON.stringify(["0.5", "0.5"]),
        }];
      }
      throw new Error(`unexpected url ${url}`);
    });
  });

  test("loads order book and sets executable odds within detection cap", async () => {
    vi.mocked(polymarketPluginGet).mockImplementation(async (url: string) => {
      if (url.includes("gamma-api.polymarket.com/markets")) {
        return [{
          clob_token_ids: JSON.stringify(["123456789"]),
          outcomePrices: JSON.stringify(["0.5", "0.5"]),
        }];
      }
      if (url.includes("/book")) {
        return {
          tick_size: "0.01",
          min_order_size: "5",
          neg_risk: false,
          asks: [{ price: "0.18", size: "100" }],
        };
      }
      throw new Error(`unexpected url ${url}`);
    });

    const option = {
      itemId: "123456789",
      odds: 5,
      betMoney: 5,
    };

    const out = await polymarketProvider.checkBet(
      accountWithToken("{}", { multiply: 7 }),
      option as any,
    );

    expect(out.data).toMatchObject({
      tokenId: "123456789",
      detectionOdds: 5,
      detectionMaxPrice: 0.2,
      bookPrice: 0.18,
      side: "BUY",
      bookFetchedAt: expect.any(Number),
      orderOptions: {
        tickSize: "0.01",
        minOrderSize: 5,
        negRisk: false,
        asks: [{ price: 0.18, size: 100 }],
      },
    });
    expect(out.odds).toBeCloseTo(5.5556, 3);
    expect(out.checkError).toBeUndefined();
  });

  test("rejects when pm_sport shows series decided", async () => {
    const option = {
      itemId: "123456789",
      odds: 4.762,
      betMoney: 28,
      match: {
        pmSport: {
          mapScore: { home: 1, away: 2 },
          bo: 3,
          status: "running",
        },
      },
      bet: { round: 0 },
    };

    const out = await polymarketProvider.checkBet(
      accountWithToken("{}", { multiply: 7 }),
      option as any,
    );

    expect(out.data).toBeNull();
    expect(out.checkError).toContain("系列赛已决出");
    expect(polymarketPluginGet).not.toHaveBeenCalled();
  });

  test("rejects when pm_sport shows match ended", async () => {
    const option = {
      itemId: "123456789",
      odds: 4.762,
      betMoney: 28,
      match: {
        pmSport: {
          ended: true,
          mapScore: { home: 1, away: 2 },
          bo: 3,
        },
      },
      bet: { round: 0 },
    };

    const out = await polymarketProvider.betting(
      accountWithToken(JSON.stringify({
        walletAddress: "0xabc",
        privateKey: "0x" + "11".repeat(32),
        apiCreds: { apiKey: "k", secret: "s", passphrase: "p" },
      })),
      option as any,
    );

    expect(out.success).toBe(false);
    expect(out.message).toContain("比赛已结束");
    expect(polymarketPluginGet).not.toHaveBeenCalled();
  });

  test("rejects when book price is worse than detection odds", async () => {
    vi.mocked(polymarketPluginGet).mockImplementation(async (url: string) => {
      if (url.includes("gamma-api.polymarket.com/markets")) {
        return [{
          clob_token_ids: JSON.stringify(["123456789"]),
          outcomePrices: JSON.stringify(["0.5", "0.5"]),
        }];
      }
      if (url.includes("/book")) {
        return {
          tick_size: "0.01",
          min_order_size: "5",
          neg_risk: false,
          asks: [{ price: "0.32", size: "100" }],
        };
      }
      throw new Error(`unexpected url ${url}`);
    });

    const option = {
      itemId: "123456789",
      odds: 5,
      betMoney: 5,
    };

    const out = await polymarketProvider.checkBet(
      accountWithToken("{}", { multiply: 7 }),
      option as any,
    );

    expect(out.data).toBeNull();
    expect(out.checkError).toContain("盘口价高于检测价");
  });

  test("derives apiBetMoney from USDT betMoney after exchange", async () => {
    vi.mocked(polymarketPluginGet).mockImplementation(async (url: string) => {
      if (url.includes("gamma-api.polymarket.com/markets")) {
        return [{
          clob_token_ids: JSON.stringify(["123456789"]),
          outcomePrices: JSON.stringify(["0.5", "0.5"]),
        }];
      }
      if (url.includes("/book")) {
        return {
          tick_size: "0.01",
          min_order_size: "5",
          neg_risk: false,
          asks: [{ price: "0.5", size: "100" }],
        };
      }
      throw new Error(`unexpected url ${url}`);
    });

    const option = {
      itemId: "123456789",
      odds: 2,
      betMoney: 14,
    };

    const out = await polymarketProvider.checkBet(
      accountWithToken("{}", { multiply: 10 }),
      option as any,
    );

    expect(out.data).toMatchObject({
      betMoney: 14,
      apiBetMoney: 14,
      detectionOdds: 2,
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
      betMoney: 7,
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

  test("scales mapped order amounts to CNY display via USDT exchange", async () => {
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

    const orders = await polymarketProvider.getOrders!(accountWithToken(JSON.stringify({
      walletAddress: "0xabc",
      apiCreds: {
        apiKey: "key-1",
        secret: "c2VjcmV0",
        passphrase: "pass-1",
      },
    }), { multiply: 10 }));

    expect(orders[0]?.betMoney).toBe(7);
    expect(orders[0]?.reward).toBe(14);
  });

  test("returns empty array when credentials are missing", async () => {
    const orders = await polymarketProvider.getOrders!(accountWithToken("{}"));
    expect(orders).toEqual([]);
    expect(polymarketPluginGet).not.toHaveBeenCalled();
  });
});

function pmBettingAccount() {
  return accountWithToken(JSON.stringify({
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
}

function bookGetCalls() {
  return vi.mocked(polymarketPluginGet).mock.calls.filter(
    call => String(call[0]).includes("/book"),
  );
}

describe("PM precheck /book reuse", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(polymarketPluginGet).mockReset();
    vi.mocked(polymarketPluginPost).mockReset();
  });

  test("betting reuses checkBet /book within TTL", async () => {
    const now = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    mockPluginGetWithBook({
      tick_size: "0.01",
      min_order_size: "1",
      neg_risk: false,
      asks: [{ price: "0.5", size: "100" }],
    });
    vi.mocked(polymarketPluginPost).mockResolvedValue({
      success: true,
      orderID: "order-reuse",
      status: "matched",
      takingAmount: "2000000",
      makingAmount: "1000000",
    });

    const account = pmBettingAccount();
    const option = {
      itemId: "123456789",
      odds: 2,
      betMoney: 10,
    };

    const checked = await polymarketProvider.checkBet!(account, option as any);
    expect(checked.data).toBeTruthy();
    expect(bookGetCalls().length).toBeGreaterThan(0);

    vi.mocked(polymarketPluginGet).mockClear();
    const result = await polymarketProvider.betting!(account, checked as any);

    expect(result.success).toBe(true);
    expect(bookGetCalls()).toHaveLength(0);
  });

  test("betting refetches /book when precheck cache expired", async () => {
    let now = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    mockPluginGetWithBook({
      tick_size: "0.01",
      min_order_size: "1",
      neg_risk: false,
      asks: [{ price: "0.5", size: "100" }],
    });
    vi.mocked(polymarketPluginPost).mockResolvedValue({
      success: true,
      orderID: "order-refetch",
      status: "matched",
      takingAmount: "2000000",
      makingAmount: "1000000",
    });

    const account = pmBettingAccount();
    const option = {
      itemId: "123456789",
      odds: 2,
      betMoney: 10,
    };

    const checked = await polymarketProvider.checkBet!(account, option as any);
    expect(checked.data).toBeTruthy();

    now += 801;
    vi.mocked(polymarketPluginGet).mockClear();
    const result = await polymarketProvider.betting!(account, checked as any);

    expect(result.success).toBe(true);
    expect(bookGetCalls().length).toBeGreaterThan(0);
  });
});
