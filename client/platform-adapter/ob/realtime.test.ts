import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { OB_A8_MQTT_PASSWORD, OB_A8_MQTT_URL, OB_A8_MQTT_USERNAME } from "./mqttConfig";
import { createObRealtimeClient, type ObMqttMessage } from "./realtime";

const connectMock = vi.fn();
const fetchObDemoMqttConfig = vi.fn();
const getObA8MqttConfig = vi.fn();
const getObChangmenMqttConfig = vi.fn();

vi.mock("mqtt", () => ({
  default: {
    connect: (...args: unknown[]) => connectMock(...args),
  },
}));

vi.mock("./mqttSession", () => ({
  fetchObDemoMqttConfig: (...args: unknown[]) => fetchObDemoMqttConfig(...args),
  getObA8MqttConfig: (...args: unknown[]) => getObA8MqttConfig(...args),
  getObChangmenMqttConfig: (...args: unknown[]) => getObChangmenMqttConfig(...args),
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

const changmenConfig = {
  url: "ws://127.0.0.1:3560/esport/ws-forward/OB?u=wss%3A%2F%2Fob-mqtt.example%2Fws",
  username: "ob-session-token",
  source: "changmen" as const,
};

const a8Config = {
  url: OB_A8_MQTT_URL,
  username: OB_A8_MQTT_USERNAME,
  password: OB_A8_MQTT_PASSWORD,
  source: "a8" as const,
};

beforeEach(() => {
  fetchObDemoMqttConfig.mockReset();
  getObA8MqttConfig.mockReset();
  getObChangmenMqttConfig.mockReset();
  getObA8MqttConfig.mockReturnValue(a8Config);
  getObChangmenMqttConfig.mockReturnValue(changmenConfig);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("createObRealtimeClient", () => {
  test("connects with A8 fixed credentials (admin/Qazqaz123...) and reconnectPeriod 5s", async () => {
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
        username: OB_A8_MQTT_USERNAME,
        password: OB_A8_MQTT_PASSWORD,
        reconnectPeriod: 5000,
      }),
    );
    expect(received).toEqual([{ topic: "/market/oddsUpdate/1", payload: "[{}]" }]);
    expect(fake.subscribe).toHaveBeenCalledWith("/market/oddsUpdate/1", expect.any(Function));

    await client.stop();
  });

  test("falls back to CHANGMEN forward when demo connection errors", async () => {
    fetchObDemoMqttConfig.mockResolvedValue(demoConfig);
    const demoClient = fakeMqttClient();
    const changmenClient = fakeMqttClient();
    connectMock.mockReturnValueOnce(demoClient).mockReturnValueOnce(changmenClient);

    const client = createObRealtimeClient();
    await client.start(() => {});
    demoClient.emit("error", new Error("connection refused"));

    await vi.waitFor(() => {
      expect(connectMock).toHaveBeenCalledTimes(2);
    });

    expect(getObChangmenMqttConfig).toHaveBeenCalledWith(demoConfig.url, demoConfig.username);
    expect(connectMock).toHaveBeenNthCalledWith(
      2,
      changmenConfig.url,
      expect.objectContaining({
        username: OB_A8_MQTT_USERNAME,
        password: OB_A8_MQTT_PASSWORD,
        reconnectPeriod: 5000,
      }),
    );

    await client.stop();
  });

  test("falls back to A8 relay when CHANGMEN forward errors", async () => {
    fetchObDemoMqttConfig.mockResolvedValue(demoConfig);
    const demoClient = fakeMqttClient();
    const changmenClient = fakeMqttClient();
    const a8Client = fakeMqttClient();
    connectMock
      .mockReturnValueOnce(demoClient)
      .mockReturnValueOnce(changmenClient)
      .mockReturnValueOnce(a8Client);

    const client = createObRealtimeClient();
    await client.start(() => {});
    demoClient.emit("error", new Error("refused"));
    await vi.waitFor(() => expect(connectMock).toHaveBeenCalledTimes(2));
    changmenClient.emit("error", new Error("refused"));

    await vi.waitFor(() => {
      expect(connectMock).toHaveBeenCalledTimes(3);
    });

    expect(connectMock).toHaveBeenNthCalledWith(
      3,
      OB_A8_MQTT_URL,
      expect.objectContaining({
        username: OB_A8_MQTT_USERNAME,
        password: OB_A8_MQTT_PASSWORD,
        reconnectPeriod: 5000,
      }),
    );

    await client.stop();
  });

  test("refreshes demo login after A8 relay errors", async () => {
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

    a8Client.emit("error", new Error("A8 relay down"));

    await vi.waitFor(() => {
      expect(fetchObDemoMqttConfig).toHaveBeenCalledTimes(2);
      expect(connectMock).toHaveBeenCalledTimes(2);
    });

    expect(connectMock).toHaveBeenNthCalledWith(
      2,
      "wss://ob-mqtt-refreshed.example/ws",
      expect.objectContaining({
        username: OB_A8_MQTT_USERNAME,
        password: OB_A8_MQTT_PASSWORD,
      }),
    );

    await client.stop();
  });
});
