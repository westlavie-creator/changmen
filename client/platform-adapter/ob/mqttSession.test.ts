import { beforeEach, describe, expect, test, vi } from "vitest";
import { OB_A8_MQTT_PASSWORD, OB_A8_MQTT_URL, OB_A8_MQTT_USERNAME } from "./mqttConfig";
import { fetchObDemoMqttConfig, getObA8MqttConfig } from "./mqttSession";

vi.mock("@/api/esport", () => ({
  getCollectPlatform: vi.fn().mockResolvedValue({ Token: "platform-token" }),
}));

vi.mock("@/shared/http", () => ({
  directGet: vi.fn(),
}));

import { directGet } from "@/shared/http";

describe("getObA8MqttConfig", () => {
  test("returns A8 relay credentials from bundle", () => {
    expect(getObA8MqttConfig()).toEqual({
      url: OB_A8_MQTT_URL,
      username: OB_A8_MQTT_USERNAME,
      password: OB_A8_MQTT_PASSWORD,
      source: "a8",
    });
  });
});

describe("fetchObDemoMqttConfig", () => {
  beforeEach(() => {
    vi.mocked(directGet).mockReset();
  });

  test("parses mqtt endpoint and prefers platform token", async () => {
    const addr = btoa(
      JSON.stringify({ mqtt: ["wss://pro-dj-aws-mqtt.example:8084/mqtt"] }),
    );
    const pc = `https://entry.example/pc?token=login-token&addr=${encodeURIComponent(addr)}`;
    vi.mocked(directGet).mockResolvedValue({ data: { pc } });

    await expect(fetchObDemoMqttConfig()).resolves.toEqual({
      url: "wss://pro-dj-aws-mqtt.example:8084/mqtt",
      username: "platform-token",
      source: "demo",
    });
  });

  test("returns null when login has no mqtt endpoint", async () => {
    vi.mocked(directGet).mockResolvedValue({ data: { pc: "https://entry.example/pc?token=t" } });
    await expect(fetchObDemoMqttConfig()).resolves.toBeNull();
  });
});
