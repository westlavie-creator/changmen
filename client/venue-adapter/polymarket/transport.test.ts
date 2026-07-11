import type { PlatformAccount } from "@changmen/client-core/models/platformAccount";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { POLYMARKET_PLUGIN_REQUIRED_MSG, polymarketL2Get, polymarketPluginGet } from "./transport";

const hkEnabled = vi.hoisted(() => vi.fn(() => false));

vi.mock("@changmen/client-core/chrome-plugin/bridge", () => ({
  hasA8PluginRuntime: vi.fn(() => true),
  a8PluginGet: vi.fn(),
  a8PluginPost: vi.fn(),
}));

vi.mock("@venue/shared/venueHkEgress", () => ({
  isVenueHkEgressEnabled: () => hkEnabled(),
}));

vi.mock("@changmen/client-core/shared/platformHttp", () => ({
  changmenRelayHttpRequest: vi.fn(),
  parseJsonLoose: (text: string) => JSON.parse(text),
}));

import { a8PluginGet, hasA8PluginRuntime } from "@changmen/client-core/chrome-plugin/bridge";
import { changmenRelayHttpRequest } from "@changmen/client-core/shared/platformHttp";

describe("polymarket transport", () => {
  beforeEach(() => {
    hkEnabled.mockReturnValue(false);
    vi.mocked(hasA8PluginRuntime).mockReturnValue(true);
    vi.mocked(a8PluginGet).mockReset();
    vi.mocked(changmenRelayHttpRequest).mockReset();
  });

  test("无扩展时抛错", async () => {
    vi.mocked(hasA8PluginRuntime).mockReturnValue(false);
    await expect(polymarketPluginGet("https://gamma-api.polymarket.com/events")).rejects.toThrow(
      POLYMARKET_PLUGIN_REQUIRED_MSG,
    );
  });

  test("unwrap axios response.data", async () => {
    vi.mocked(a8PluginGet).mockResolvedValue({ status: 200, data: [{ id: "e1" }] });
    const rows = await polymarketPluginGet<Array<{ id: string }>>("https://gamma-api.polymarket.com/events");
    expect(rows).toEqual([{ id: "e1" }]);
    expect(a8PluginGet).toHaveBeenCalledWith(
      "https://gamma-api.polymarket.com/events",
      { timeout: 60_000, withCredentials: false },
    );
  });

  test("HTTP 4xx 抛错", async () => {
    vi.mocked(a8PluginGet).mockResolvedValue({ status: 429, data: "rate limited" });
    await expect(polymarketPluginGet("https://gamma-api.polymarket.com/events")).rejects.toThrow("rate limited");
  });

  test("扩展返回 Error 对象时抛错", async () => {
    vi.mocked(a8PluginGet).mockResolvedValue(new Error("network failed"));
    await expect(polymarketPluginGet("https://clob.polymarket.com/balance-allowance")).rejects.toThrow("network failed");
  });

  test("HK 出口开启时走 http-relay", async () => {
    hkEnabled.mockReturnValue(true);
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
    expect(a8PluginGet).not.toHaveBeenCalled();
  });

  test("HK 出口 L2 GET 走 relay 服务端签名", async () => {
    hkEnabled.mockReturnValue(true);
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
});
