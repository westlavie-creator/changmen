import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { buildPolymarketL2HeadersFromToken } from "./clob_l2.js";

vi.mock("./clob_l2.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    buildPolymarketL2HeadersFromToken: vi.fn(actual.buildPolymarketL2HeadersFromToken),
  };
});

const { fetchPolymarketCollateralBalance } = await import("./balance.js");

describe("fetchPolymarketCollateralBalance", () => {
  const token = JSON.stringify({
    walletAddress: "0xabc",
    signatureType: 3,
    apiCreds: { apiKey: "k", secret: "c2VjcmV0", passphrase: "p" },
  });

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async (url) => {
      if (String(url).includes("/time"))
        return new Response("1700000000");
      return new Response(JSON.stringify({ balance: "2500000" }), { status: 200 });
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(buildPolymarketL2HeadersFromToken).mockRestore?.();
  });

  test("returns USDC balance from CLOB", async () => {
    const out = await fetchPolymarketCollateralBalance({
      token,
      gateway: "https://clob.polymarket.com",
    });
    expect(out).toEqual({ balance: 2.5, currency: "USDT" });
    expect(buildPolymarketL2HeadersFromToken).toHaveBeenCalledWith(
      token,
      "GET",
      "/balance-allowance",
      "",
      1700000000,
    );
  });

  test("returns null without token", async () => {
    await expect(fetchPolymarketCollateralBalance({})).resolves.toBeNull();
  });
});
