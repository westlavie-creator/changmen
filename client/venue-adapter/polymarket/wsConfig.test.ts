import { describe, expect, test, vi } from "vitest";
import {
  PM_MARKET_WS_FORWARD_PATH,
  PM_USER_WS_FORWARD_PATH,
  resolvePolymarketMarketWsUrl,
  resolvePolymarketUserWsUrl,
} from "./wsConfig";

vi.mock("@changmen/client-core/shared/hkRelayOrigin", () => ({
  resolveHkRelayHttpOrigin: () => "http://127.0.0.1:3560",
}));

vi.mock("@venue/shared/changmenWsBase", () => ({
  resolveChangmenWsBase: () => "http://127.0.0.1:3560",
  changmenHttpBaseToWs: (base: string) => base.replace(/^http/i, "ws"),
}));

describe("polymarket wsConfig", () => {
  test("固定走 changmen ws-forward", () => {
    expect(resolvePolymarketMarketWsUrl()).toBe(`ws://127.0.0.1:3560${PM_MARKET_WS_FORWARD_PATH}`);
    expect(resolvePolymarketUserWsUrl()).toBe(`ws://127.0.0.1:3560${PM_USER_WS_FORWARD_PATH}`);
  });
});
