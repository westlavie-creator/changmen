import mqtt, { type MqttClient } from "mqtt";
import { OB_MQTT_PASS, OB_MQTT_USER, relayWsUrl } from "@/shared/platform";

const OB_WS_PATH = "/esport/ws/OB";
const OB_MQTT_CLIENT_ID = "mqttjs_dj1250901313125773543";

export type ObMqttMessage = {
  topic: string;
  payload: string;
};

export type ObRealtimeStatus = {
  platform: string;
  upstreamConnected: boolean;
  messagesReceived?: number;
  messagesPublished?: number;
  lastError?: string | null;
  lastUpstreamAt?: number | null;
  forwardedTopics?: number;
};

export type ObRealtimeClient = {
  start(onMessage: (message: ObMqttMessage) => void): Promise<ObRealtimeStatus | void>;
  stop(): Promise<ObRealtimeStatus | void>;
  status?(): Promise<ObRealtimeStatus | unknown>;
  subscribe(topic: string): Promise<void>;
  unsubscribe(topic: string): Promise<void>;
  connected(): boolean;
};

function getElectronObRelay() {
  if (typeof window === "undefined") return null;
  return window.gamebetRelays?.ob ?? null;
}

function createElectronObRealtimeClient(): ObRealtimeClient {
  const relay = getElectronObRelay();
  let removeMessageListener: (() => void) | null = null;
  let upstreamConnected = false;

  return {
    async start(onMessage) {
      removeMessageListener?.();
      removeMessageListener = relay?.onMessage(onMessage) ?? null;
      const status = await relay?.start();
      upstreamConnected = Boolean(status?.upstreamConnected);
      return status;
    },
    async stop() {
      removeMessageListener?.();
      removeMessageListener = null;
      const status = await relay?.stop();
      upstreamConnected = false;
      return status;
    },
    status: () => relay?.status() ?? Promise.resolve({ platform: "OB", upstreamConnected: false }),
    async subscribe(topic) {
      await relay?.subscribe(topic);
    },
    async unsubscribe(topic) {
      await relay?.unsubscribe(topic);
    },
    connected() {
      return upstreamConnected;
    },
  };
}

function createWebObRealtimeClient(): ObRealtimeClient {
  let client: MqttClient | null = null;
  let onMessageHandler: ((message: ObMqttMessage) => void) | null = null;
  const topics = new Set<string>();

  return {
    async start(onMessage) {
      onMessageHandler = onMessage;
      if (client?.connected) return;
      if (client) {
        client.removeAllListeners();
        client.end(true);
        client = null;
      }

      const wsUrl = relayWsUrl(OB_WS_PATH);
      client = mqtt.connect(wsUrl, {
        username: OB_MQTT_USER,
        password: OB_MQTT_PASS,
        clientId: OB_MQTT_CLIENT_ID,
        clean: true,
        keepalive: 60,
        reconnectPeriod: 5000,
        protocolId: "MQTT",
        protocolVersion: 4,
        connectTimeout: 15_000,
      });

      client.on("message", (topic, buf) => {
        onMessageHandler?.({ topic, payload: buf.toString() });
      });

      client.on("error", (err) => {
        console.warn("[OB MQTT] error", err.message, wsUrl);
      });
      client.on("offline", () => {
        console.warn("[OB MQTT] offline", wsUrl);
      });
      client.on("reconnect", () => {
        console.debug("[OB MQTT] reconnecting...");
      });
      client.on("connect", () => {
        console.info("[OB MQTT] connected", wsUrl);
        for (const topic of topics) client?.subscribe(topic);
      });
    },
    async stop() {
      topics.clear();
      client?.end(true);
      client = null;
      onMessageHandler = null;
    },
    async subscribe(topic) {
      topics.add(topic);
      if (client?.connected) {
        await new Promise<void>((resolve) => {
          client?.subscribe(topic, () => resolve());
        });
      }
    },
    async unsubscribe(topic) {
      topics.delete(topic);
      if (client?.connected) client.unsubscribe(topic);
    },
    connected() {
      return Boolean(client?.connected);
    },
  };
}

export function createObRealtimeClient(): ObRealtimeClient {
  if (getElectronObRelay()) return createElectronObRealtimeClient();
  return createWebObRealtimeClient();
}
