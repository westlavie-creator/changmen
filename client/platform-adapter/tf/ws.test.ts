import { afterEach, describe, expect, test, vi } from "vitest";
import { startTfOddsWs } from "./ws";
import { resetTfWsHostRotateForTests } from "./wsConfig";

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static OPEN = 1;
  url: string;
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  close = vi.fn(() => {
    this.readyState = 3;
    this.onclose?.();
  });
}

describe("startTfOddsWs", () => {
  afterEach(() => {
    MockWebSocket.instances = [];
    resetTfWsHostRotateForTests();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  test("connects to first A8 ws host with stripped auth token", async () => {
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);

    const onMessage = vi.fn();
    const onError = vi.fn();
    const stop = startTfOddsWs({
      getToken: async () => "Token abc123",
      onMessage,
      onError,
    });

    await vi.waitFor(() => expect(MockWebSocket.instances.length).toBe(1));
    const ws = MockWebSocket.instances[0]!;
    expect(ws.url).toBe(
      "wss://api.a8.to/esport/ws/TF?auth_token=abc123&combo=false",
    );

    ws.onopen?.();
    ws.onmessage?.({
      data: JSON.stringify({
        data: { market_id: "m1", selection: [{ name: "Home", euro_odds: 1.5, status: "open" }] },
      }),
    });
    expect(onMessage).toHaveBeenCalledOnce();

    stop();
    expect(ws.close).toHaveBeenCalled();
  });

  test("rotates ws host on reconnect", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);

    const stop = startTfOddsWs({
      getToken: async () => "tok1",
      onMessage: vi.fn(),
      onError: vi.fn(),
    });

    await vi.waitFor(() => expect(MockWebSocket.instances.length).toBe(1));
    expect(MockWebSocket.instances[0]!.url).toContain("api.a8.to");

    MockWebSocket.instances[0]!.onclose?.();
    await vi.advanceTimersByTimeAsync(1000);

    await vi.waitFor(() => expect(MockWebSocket.instances.length).toBe(2));
    expect(MockWebSocket.instances[1]!.url).toContain("47.115.75.57");

    stop();
  });
});
