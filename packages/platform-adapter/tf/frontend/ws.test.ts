import { afterEach, describe, expect, test, vi } from "vitest";
import { startTfOddsWs } from "./ws";

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  close = vi.fn();
}

describe("startTfOddsWs", () => {
  afterEach(() => {
    MockWebSocket.instances = [];
    vi.unstubAllGlobals();
  });

  test("connects directly to A8 TF ws with stripped auth token", async () => {
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
      "wss://47.115.75.57/esport/ws/TF?auth_token=abc123&combo=false",
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
});
