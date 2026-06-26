import type { PlatformAccount } from "@/models/platformAccount";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { polymarketProvider } from "./bet";
import { POLYMARKET_CLOB_API } from "./api";
import { polymarketPluginGet } from "./transport";

vi.mock("./transport", () => ({
  polymarketPluginGet: vi.fn(),
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

describe("polymarketProvider.getBalance", () => {
  beforeEach(() => {
    vi.mocked(polymarketPluginGet).mockReset();
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

  test("infers POLY_PROXY signature type when funder differs from wallet", async () => {
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
    expect(url).toBe(`${POLYMARKET_CLOB_API}/balance-allowance?asset_type=COLLATERAL&signature_type=1`);
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
