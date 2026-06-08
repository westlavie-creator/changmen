import { afterEach, describe, expect, test, vi } from "vitest";
import { createObRealtimeClient, type ObMqttMessage } from "./realtime";

type ObRelayApi = {
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  status: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  unsubscribe: ReturnType<typeof vi.fn>;
  publish: ReturnType<typeof vi.fn>;
  onMessage: ReturnType<typeof vi.fn>;
};

function setElectronObRelay(ob: ObRelayApi): void {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      gamebetRelays: { ob },
    },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(globalThis, "window");
});

describe("createObRealtimeClient", () => {
  test("uses the Electron OB relay through a project realtime client", async () => {
    let listener: (message: ObMqttMessage) => void = () => {};
    const removeListener = vi.fn();
    const ob = {
      start: vi.fn().mockResolvedValue({ platform: "OB", upstreamConnected: true }),
      stop: vi.fn().mockResolvedValue({ platform: "OB", upstreamConnected: false }),
      status: vi.fn().mockResolvedValue({ platform: "OB", upstreamConnected: true }),
      subscribe: vi.fn().mockResolvedValue({ platform: "OB", upstreamConnected: true }),
      unsubscribe: vi.fn().mockResolvedValue({ platform: "OB", upstreamConnected: true }),
      publish: vi.fn().mockResolvedValue(true),
      onMessage: vi.fn((callback: (message: ObMqttMessage) => void) => {
        listener = callback;
        return removeListener;
      }),
    };
    setElectronObRelay(ob);

    const received: ObMqttMessage[] = [];
    const client = createObRealtimeClient();
    const status = await client.start((message) => received.push(message));
    listener({ topic: "/market/oddsUpdate/1", payload: "[{}]" });
    await client.subscribe("/market/oddsUpdate/1");
    await client.unsubscribe("/market/oddsUpdate/1");
    await client.stop();

    expect(status).toEqual({ platform: "OB", upstreamConnected: true });
    expect(received).toEqual([{ topic: "/market/oddsUpdate/1", payload: "[{}]" }]);
    expect(ob.onMessage).toHaveBeenCalledOnce();
    expect(ob.start).toHaveBeenCalledOnce();
    expect(ob.subscribe).toHaveBeenCalledWith("/market/oddsUpdate/1");
    expect(ob.unsubscribe).toHaveBeenCalledWith("/market/oddsUpdate/1");
    expect(removeListener).toHaveBeenCalledOnce();
    expect(ob.stop).toHaveBeenCalledOnce();
  });
});
