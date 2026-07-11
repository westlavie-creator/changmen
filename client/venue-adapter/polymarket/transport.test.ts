import type { PlatformAccount } from "@changmen/client-core/models/platformAccount";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { polymarketL2Get, polymarketPluginGet, polymarketPluginPost } from "./transport";

vi.mock("@changmen/client-core/shared/platformHttp", () => ({
  changmenRelayHttpRequest: vi.fn(),
  parseJsonLoose: (text: string) => JSON.parse(text),
}));

import { changmenRelayHttpRequest } from "@changmen/client-core/shared/platformHttp";

describe("polymarket transport", () => {
  beforeEach(() => {
    vi.mocked(changmenRelayHttpRequest).mockReset();
  });

  test("GET 走 http-relay", async () => {
    vi.mocked(changmenRelayHttpRequest).mockResolvedValue({
      status: 200,
      text: JSON.stringify([{ id: "hk1" }]),
    });
    const rows = await polymarketPluginGet<Array<{ id: string }>>("https://gamma-api.polymarket.com/events");
    expect(rows).toEqual([{ id: "hk1" }]);
    expect(changmenRelayHttpRequest).toHaveBeenCalledWith(
      "https://gamma-api.polymarket.com/events",
      { method: "GET", headers: undefined },
    );
  });

  test("HTTP 4xx 抛错", async () => {
    vi.mocked(changmenRelayHttpRequest).mockResolvedValue({
      status: 429,
      text: "rate limited",
    });
    await expect(polymarketPluginGet("https://gamma-api.polymarket.com/events")).rejects.toThrow("rate limited");
  });

  test("L2 GET 走 relay 服务端签名", async () => {
    vi.mocked(changmenRelayHttpRequest).mockResolvedValue({
      status: 200,
      text: JSON.stringify({ data: [], next_cursor: "LTE=" }),
    });
    const account = {
      accountId: 47,
      provider: "Polymarket",
      token: JSON.stringify({
        walletAddress: "0xabc",
        apiCreds: { apiKey: "k", secret: "c2VjcmV0", passphrase: "p" },
      }),
    } as unknown as PlatformAccount;

    await polymarketL2Get(account, "https://clob.polymarket.com/data/trades?after=1", "/data/trades");

    expect(changmenRelayHttpRequest).toHaveBeenCalledWith(
      "https://clob.polymarket.com/data/trades?after=1",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          "x-pm-account-id": "47",
          "x-pm-l2-path": "/data/trades",
        }),
      }),
    );
  });

  test("L2 POST 剥离 POLY 头并走 relay", async () => {
    vi.mocked(changmenRelayHttpRequest).mockResolvedValue({
      status: 200,
      text: JSON.stringify({ success: true }),
    });
    const account = {
      accountId: 47,
      provider: "Polymarket",
      token: "{}",
    } as unknown as PlatformAccount;

    await polymarketPluginPost("https://clob.polymarket.com/order", { foo: 1 }, {
      account,
      l2Path: "/order",
      headers: {
        POLY_ADDRESS: "0xabc",
        "Content-Type": "application/json",
      },
    });

    expect(changmenRelayHttpRequest).toHaveBeenCalledWith(
      "https://clob.polymarket.com/order",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-pm-account-id": "47",
          "x-pm-l2-path": "/order",
          "Content-Type": "application/json",
        }),
      }),
    );
    const headers = vi.mocked(changmenRelayHttpRequest).mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers.POLY_ADDRESS).toBeUndefined();
  });
});
