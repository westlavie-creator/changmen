import type { PlatformAccount } from "@/models/platformAccount";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  awaitPolymarketOrderWatch,
  registerPolymarketOrderWatch,
  stopAllPolymarketUserWs,
  warmAllPolymarketUserWs,
  warmPolymarketUserWs,
} from "./userWs";

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

function pmAccount(): PlatformAccount {
  return {
    provider: "Polymarket",
    token: JSON.stringify({
      apiKey: "key-1",
      secret: "secret-1",
      passphrase: "pass-1",
    }),
  } as PlatformAccount;
}

describe("polymarket user ws", () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.stubGlobal("WebSocket", Object.assign(MockWebSocket, { OPEN: 1 }) as unknown as typeof WebSocket);
  });

  afterEach(() => {
    stopAllPolymarketUserWs();
    vi.unstubAllGlobals();
  });

  it("warmPolymarketUserWs opens authenticated session without order watch", () => {
    expect(warmPolymarketUserWs(pmAccount())).toBe(true);
    expect(MockWebSocket.instances).toHaveLength(1);
    const ws = MockWebSocket.instances[0]!;
    ws.open();
    const subscribe = JSON.parse(ws.sent[0]!);
    expect(subscribe.type).toBe("user");
    expect(subscribe.auth.apiKey).toBe("key-1");
    expect(subscribe.markets).toEqual([]);
  });

  it("warmAllPolymarketUserWs dedupes by apiKey", () => {
    warmAllPolymarketUserWs([
      pmAccount(),
      pmAccount(),
      { provider: "OB" } as PlatformAccount,
    ]);
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it("register subscribes condition_id and resolves matched on trade", async () => {
    registerPolymarketOrderWatch(pmAccount(), "0xorder", {
      conditionId: "0xcondition",
      timeoutMs: 5_000,
    });

    expect(MockWebSocket.instances).toHaveLength(1);
    const ws = MockWebSocket.instances[0]!;
    ws.open();
    const subscribe = JSON.parse(ws.sent[0]!);
    expect(subscribe.markets).toEqual(["0xcondition"]);

    ws.onmessage?.({
      data: JSON.stringify({
        event_type: "trade",
        type: "TRADE",
        status: "MATCHED",
        taker_order_id: "0xorder",
        size: "12",
      }),
    });

    const result = await awaitPolymarketOrderWatch("0xorder");
    expect(result?.outcome).toBe("matched");
    expect(result?.row?.size_matched).toBe("12");
  });

  it("watch resolves null on timeout so REST poll can continue", async () => {
    vi.useFakeTimers();
    registerPolymarketOrderWatch(pmAccount(), "0xlate", {
      conditionId: "0xcondition",
      timeoutMs: 1_000,
    });
    const pending = awaitPolymarketOrderWatch("0xlate");
    await vi.advanceTimersByTimeAsync(1_100);
    expect(await pending).toBeNull();
    vi.useRealTimers();
  });
});
