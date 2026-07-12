import { describe, expect, test, vi, beforeEach } from "vitest";
import {
  PM_MARKET_WS_FORWARD_PATH,
  PM_USER_WS_FORWARD_PATH,
  resolvePolymarketMarketWsUrl,
  resolvePolymarketUserWsUrl,
} from "./wsConfig";
import { POLYMARKET_MARKET_WS, POLYMARKET_USER_WS } from "./api";
import { resetPmMarketWsSourceModeForTests, setPmMarketWsSourceMode } from "./pmMarketWsMode";
import { resetPmUserWsSourceModeForTests, setPmUserWsSourceMode } from "./pmUserWsMode";

vi.mock("@changmen/client-core/shared/hkRelayOrigin", () => ({
  resolveHkRelayHttpOrigin: () => "http://127.0.0.1:3560",
}));

vi.mock("../shared/changmenWsBase", () => ({
  resolveChangmenWsBase: () => "http://127.0.0.1:3560",
  changmenHttpBaseToWs: (base: string) => base.replace(/^http/i, "ws"),
}));

describe("polymarket wsConfig", () => {
  beforeEach(() => {
    resetPmMarketWsSourceModeForTests("changmen");
    resetPmUserWsSourceModeForTests("changmen");
  });

  test("changmen 模式走 ws-forward", () => {
    expect(resolvePolymarketMarketWsUrl()).toBe(`ws://127.0.0.1:3560${PM_MARKET_WS_FORWARD_PATH}`);
  });

  test("official 模式直连 Polymarket", () => {
    setPmMarketWsSourceMode("official");
    expect(resolvePolymarketMarketWsUrl()).toBe(POLYMARKET_MARKET_WS);
  });

  test("user ws changmen 模式走 ws-forward", () => {
    expect(resolvePolymarketUserWsUrl()).toBe(`ws://127.0.0.1:3560${PM_USER_WS_FORWARD_PATH}`);
  });

  test("user ws official 模式直连 Polymarket", () => {
    setPmUserWsSourceMode("official");
    expect(resolvePolymarketUserWsUrl()).toBe(POLYMARKET_USER_WS);
  });
});
