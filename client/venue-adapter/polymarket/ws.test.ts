import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cyclePmMarketWsSourceModeAndReconnect,
  notePolymarketMarketWsSubscription,
  resetOfficialFailStreakForTests,
  startPolymarketMarketWs,
} from "./ws";
import { POLYMARKET_MARKET_WS } from "./api";
import { getPmMarketWsSourceMode, resetPmMarketWsSourceModeForTests } from "./pmMarketWsMode";
import { resetPmUserWsSourceModeForTests } from "./pmUserWsMode";
import {
  markPmTransportManualOverride,
  resetPmTransportManualOverrideForTests,
} from "./pmAutoTransport";
import { setChangmenAuthTokenGetter } from "../shared/changmenAuthToken";
import { PM_MARKET_WS_FORWARD_PATH } from "./wsConfig";

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
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); },
      removeItem: (key: string) => { storage.delete(key); },
    });
    resetPmMarketWsSourceModeForTests("changmen");
    resetPmUserWsSourceModeForTests("changmen");
    resetPmTransportManualOverrideForTests();
    resetOfficialFailStreakForTests();
    setChangmenAuthTokenGetter(() => "test-jwt");
    vi.stubGlobal("WebSocket", Object.assign(MockWebSocket, { OPEN: 1 }) as unknown as typeof WebSocket);
    vi.useFakeTimers();
  });

  afterEach(() => {
    startPolymarketMarketWs({ onMessage: () => {}, onOpen: () => {} }).stop();
    setChangmenAuthTokenGetter(null);
    vi.useRealTimers();
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

  it("falls back to changmen after official WS fails 3 times", () => {
    resetPmMarketWsSourceModeForTests("official");
    startPolymarketMarketWs({ onMessage: () => {}, onOpen: () => {} });
    expect(MockWebSocket.instances[0]!.url).toBe(POLYMARKET_MARKET_WS);

    for (let i = 0; i < 3; i++) {
      MockWebSocket.instances.at(-1)!.close();
      vi.advanceTimersByTime(5_000);
    }

    expect(getPmMarketWsSourceMode()).toBe("changmen");
    expect(MockWebSocket.instances.at(-1)!.url).toContain(PM_MARKET_WS_FORWARD_PATH);
  });

  it("falls back to changmen when official receives no book after subscribing real assets", () => {
    resetPmMarketWsSourceModeForTests("official");
    startPolymarketMarketWs({ onMessage: () => {}, onOpen: () => {} });
    MockWebSocket.instances[0]!.open();

    notePolymarketMarketWsSubscription(2);
    vi.advanceTimersByTime(8_000);
    vi.advanceTimersByTime(5_000);

    expect(getPmMarketWsSourceMode()).toBe("changmen");
    expect(MockWebSocket.instances.at(-1)!.url).toContain(PM_MARKET_WS_FORWARD_PATH);
  });

  it("does not treat non-quote json as a book frame for official watchdog", () => {
    resetPmMarketWsSourceModeForTests("official");
    startPolymarketMarketWs({ onMessage: () => {}, onOpen: () => {} });
    MockWebSocket.instances[0]!.open();

    notePolymarketMarketWsSubscription(2);
    MockWebSocket.instances[0]!.onmessage?.({ data: JSON.stringify({ event_type: "subscribed", status: "ok" }) });
    vi.advanceTimersByTime(8_000);
    vi.advanceTimersByTime(5_000);

    expect(getPmMarketWsSourceMode()).toBe("changmen");
    expect(MockWebSocket.instances.at(-1)!.url).toContain(PM_MARKET_WS_FORWARD_PATH);
  });

  it("keeps official mode when a real quote frame arrives before watchdog timeout", () => {
    resetPmMarketWsSourceModeForTests("official");
    startPolymarketMarketWs({ onMessage: () => {}, onOpen: () => {} });
    MockWebSocket.instances[0]!.open();

    notePolymarketMarketWsSubscription(2);
    MockWebSocket.instances[0]!.onmessage?.({
      data: JSON.stringify({ event_type: "best_bid_ask", asset_id: "asset-a", best_ask: "0.42" }),
    });
    vi.advanceTimersByTime(8_000);

    expect(getPmMarketWsSourceMode()).toBe("official");
  });

  it("does not auto-fallback on no-book timeout after manual override", () => {
    resetPmMarketWsSourceModeForTests("official");
    markPmTransportManualOverride();
    startPolymarketMarketWs({ onMessage: () => {}, onOpen: () => {} });
    MockWebSocket.instances[0]!.open();

    notePolymarketMarketWsSubscription(2);
    vi.advanceTimersByTime(8_000);
    vi.advanceTimersByTime(5_000);

    expect(getPmMarketWsSourceMode()).toBe("official");
  });
});
