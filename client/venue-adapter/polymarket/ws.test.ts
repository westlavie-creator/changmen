import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cyclePmMarketWsSourceModeAndReconnect,
  startPolymarketMarketWs,
} from "./ws";
import { POLYMARKET_MARKET_WS } from "./api";
import { resetPmMarketWsSourceModeForTests } from "./pmMarketWsMode";
import { setChangmenAuthTokenGetter } from "../shared/changmenAuthToken";

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static OPEN = 1;
  url: string;
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  open() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  close() {
    this.readyState = 3;
    this.onclose?.();
  }
}

describe("polymarket market ws", () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    resetPmMarketWsSourceModeForTests("changmen");
    setChangmenAuthTokenGetter(() => "test-jwt");
    vi.stubGlobal("WebSocket", Object.assign(MockWebSocket, { OPEN: 1 }) as unknown as typeof WebSocket);
  });

  afterEach(() => {
    startPolymarketMarketWs({ onMessage: () => {}, onOpen: () => {} }).stop();
    setChangmenAuthTokenGetter(null);
    vi.unstubAllGlobals();
  });

  it("cyclePmMarketWsSourceModeAndReconnect keeps callbacks after stop clears active refs", () => {
    const onOpen = vi.fn();
    startPolymarketMarketWs({ onMessage: () => {}, onOpen });
    const first = MockWebSocket.instances[0]!;
    first.open();
    expect(onOpen).toHaveBeenCalledTimes(1);

    cyclePmMarketWsSourceModeAndReconnect();
    expect(MockWebSocket.instances).toHaveLength(2);
    expect(MockWebSocket.instances[1]!.url).toBe(POLYMARKET_MARKET_WS);

    MockWebSocket.instances[1]!.open();
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it("facade send still works after cycle (collector closed-over handle)", () => {
    const handle = startPolymarketMarketWs({ onMessage: () => {}, onOpen: () => {} });
    MockWebSocket.instances[0]!.open();
    handle.send("before");
    expect(MockWebSocket.instances[0]!.sent).toContain("before");

    cyclePmMarketWsSourceModeAndReconnect();
    const second = MockWebSocket.instances[1]!;
    second.open();
    handle.send("after-cycle");
    expect(second.sent).toContain("after-cycle");
    expect(MockWebSocket.instances[0]!.sent).not.toContain("after-cycle");
  });

  it("stop closes the live socket (no hub zombie)", () => {
    const handle = startPolymarketMarketWs({ onMessage: () => {}, onOpen: () => {} });
    const first = MockWebSocket.instances[0]!;
    first.open();
    const closeSpy = vi.spyOn(first, "close");
    handle.stop();
    expect(closeSpy).toHaveBeenCalled();
  });

  it("second startPolymarketMarketWs still allows mode cycle", () => {
    startPolymarketMarketWs({ onMessage: () => {}, onOpen: () => {} });
    startPolymarketMarketWs({ onMessage: () => {}, onOpen: () => {} });

    cyclePmMarketWsSourceModeAndReconnect();
    expect(MockWebSocket.instances.at(-1)!.url).toBe(POLYMARKET_MARKET_WS);
  });
});
