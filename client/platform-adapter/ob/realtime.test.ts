import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { OB_A8_MQTT_URL } from "./mqttConfig";
import { createObRealtimeClient, type ObMqttMessage } from "./realtime";

const connectMock = vi.fn();
const fetchObDemoMqttConfig = vi.fn();
const getObA8MqttConfig = vi.fn();

vi.mock("mqtt", () => ({
  default: {
    connect: (...args: unknown[]) => connectMock(...args),
  },
}));

vi.mock("./mqttSession", () => ({
  fetchObDemoMqttConfig: (...args: unknown[]) => fetchObDemoMqttConfig(...args),
  getObA8MqttConfig: (...args: unknown[]) => getObA8MqttConfig(...args),
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

const demoConfig = {
  url: "wss://ob-mqtt.example/ws",
  username: "ob-session-token",
  source: "demo" as const,
};

const a8Config = {
  url: OB_A8_MQTT_URL,
  username: "admin",
  password: "Qazqaz123...",
  source: "a8" as const,
};

beforeEach(() => {
  fetchObDemoMqttConfig.mockReset();
  getObA8MqttConfig.mockReset();
  getObA8MqttConfig.mockReturnValue(a8Config);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("createObRealtimeClient", () => {
  test("connects to demo mqtt first with platform token as username", async () => {
    fetchObDemoMqttConfig.mockResolvedValue(demoConfig);
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
        reconnectPeriod: 0,
        protocolVersion: 4,
      }),
    );
    expect(received).toEqual([{ topic: "/market/oddsUpdate/1", payload: "[{}]" }]);
    expect(fake.subscribe).toHaveBeenCalledWith("/market/oddsUpdate/1", expect.any(Function));

    await client.stop();
  });

  test("falls back to A8 relay when demo connection closes", async () => {
    fetchObDemoMqttConfig.mockResolvedValue(demoConfig);
    const demoClient = fakeMqttClient();
    const a8Client = fakeMqttClient();
    connectMock.mockReturnValueOnce(demoClient).mockReturnValueOnce(a8Client);

    const client = createObRealtimeClient();
    await client.start(() => {});
    demoClient.emit("close");

    await vi.waitFor(() => {
      expect(connectMock).toHaveBeenCalledTimes(2);
    });

    expect(connectMock).toHaveBeenNthCalledWith(
      2,
      OB_A8_MQTT_URL,
      expect.objectContaining({
        username: "admin",
        password: "Qazqaz123...",
        reconnectPeriod: 0,
      }),
    );

    await client.stop();
  });

  test("refreshes demo login after A8 relay fails", async () => {
    fetchObDemoMqttConfig
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        url: "wss://ob-mqtt-refreshed.example/ws",
        username: "fresh-token",
        source: "demo",
      });
    const a8Client = fakeMqttClient();
    const refreshedClient = fakeMqttClient();
    connectMock.mockReturnValueOnce(a8Client).mockReturnValueOnce(refreshedClient);

    const client = createObRealtimeClient();
    await client.start(() => {});
    expect(connectMock).toHaveBeenNthCalledWith(1, OB_A8_MQTT_URL, expect.any(Object));

    a8Client.emit("close");

    await vi.waitFor(() => {
      expect(fetchObDemoMqttConfig).toHaveBeenCalledTimes(2);
      expect(connectMock).toHaveBeenCalledTimes(2);
    });

    expect(connectMock).toHaveBeenNthCalledWith(
      2,
      "wss://ob-mqtt-refreshed.example/ws",
      expect.objectContaining({ username: "fresh-token" }),
    );

    await client.stop();
  });
});
