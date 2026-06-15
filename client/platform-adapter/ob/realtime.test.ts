import { afterEach, describe, expect, test, vi } from "vitest";
import { createObRealtimeClient, type ObMqttMessage } from "./realtime";

const connectMock = vi.fn();

vi.mock("mqtt", () => ({
  default: {
    connect: (...args: unknown[]) => connectMock(...args),
  },
}));

vi.mock("./mqttSession", () => ({
  resolveObMqttConnectConfig: vi.fn().mockResolvedValue({
    url: "wss://ob-mqtt.example/ws",
    token: "ob-session-token",
  }),
}));

function fakeMqttClient() {
  const handlers: Record<string, Array<(...args: unknown[]) => void>> = {};
  return {
    connected: false,
    on(event: string, fn: (...args: unknown[]) => void) {
      (handlers[event] ||= []).push(fn);
      return this;
    },
    removeAllListeners() {
      for (const key of Object.keys(handlers)) delete handlers[key];
    },
    end: vi.fn(),
    subscribe: vi.fn((_topic: string, cb?: () => void) => cb?.()),
    unsubscribe: vi.fn(),
    emit(event: string, ...args: unknown[]) {
      for (const fn of handlers[event] || []) fn(...args);
    },
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("createObRealtimeClient", () => {
  test("connects directly to OB mqtt with platform token as username", async () => {
    const fake = fakeMqttClient();
    connectMock.mockReturnValue(fake);

    const received: ObMqttMessage[] = [];
    const client = createObRealtimeClient();
    await client.start((message) => received.push(message));
    fake.connected = true;
    fake.emit("connect");
    fake.emit("message", "/market/oddsUpdate/1", Buffer.from("[{}]"));
    await client.subscribe("/market/oddsUpdate/1");

    expect(connectMock).toHaveBeenCalledWith(
      "wss://ob-mqtt.example/ws",
      expect.objectContaining({
        username: "ob-session-token",
        protocolVersion: 4,
      }),
    );
    expect(received).toEqual([{ topic: "/market/oddsUpdate/1", payload: "[{}]" }]);
    expect(fake.subscribe).toHaveBeenCalledWith("/market/oddsUpdate/1", expect.any(Function));

    await client.stop();
  });
});
