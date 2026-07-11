import { describe, expect, test, vi } from "vitest";
import {
  PM_MARKET_WS_FORWARD_PATH,
  PM_USER_WS_FORWARD_PATH,
  resolvePolymarketMarketWsUrl,
  resolvePolymarketUserWsUrl,
} from "./wsConfig";
import { POLYMARKET_MARKET_WS, POLYMARKET_USER_WS } from "./api";

vi.mock("./pmHkEgress", () => ({
  isPolymarketHkEgressEnabled: vi.fn(() => false),
}));

vi.mock("@venue/shared/changmenWsBase", () => ({
  resolveChangmenWsBase: () => "http://127.0.0.1:3560",
  changmenHttpBaseToWs: (base: string) => base.replace(/^http/i, "ws"),
}));

import { isPolymarketHkEgressEnabled } from "./pmHkEgress";

describe("polymarket wsConfig", () => {
  test("默认直连官方 WS", () => {
    vi.mocked(isPolymarketHkEgressEnabled).mockReturnValue(false);
    expect(resolvePolymarketMarketWsUrl()).toBe(POLYMARKET_MARKET_WS);
    expect(resolvePolymarketUserWsUrl()).toBe(POLYMARKET_USER_WS);
  });

  test("HK 出口走 changmen ws-forward", () => {
    vi.mocked(isPolymarketHkEgressEnabled).mockReturnValue(true);
    expect(resolvePolymarketMarketWsUrl()).toBe(`ws://127.0.0.1:3560${PM_MARKET_WS_FORWARD_PATH}`);
    expect(resolvePolymarketUserWsUrl()).toBe(`ws://127.0.0.1:3560${PM_USER_WS_FORWARD_PATH}`);
  });
});
