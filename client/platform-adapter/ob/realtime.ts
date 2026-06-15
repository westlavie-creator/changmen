import mqtt, { type MqttClient } from "mqtt";
import {
  bumpDirectRealtimeMessage,
  getDirectRealtimeStatus,
  patchDirectRealtimeStatus,
  resetDirectRealtimeStatus,
} from "@platform/shared/directRealtimeStatus";
import { PLATFORMS } from "@/shared/platform";
import { resolveObMqttConnectConfig } from "./mqttSession";

const PLATFORM = PLATFORMS.OB;
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

function syncObStatus(topics: Set<string>): void {
  patchDirectRealtimeStatus(PLATFORM, { forwardedTopics: topics.size });
}

function createDirectObRealtimeClient(): ObRealtimeClient {
  let client: MqttClient | null = null;
  let onMessageHandler: ((message: ObMqttMessage) => void) | null = null;
  const topics = new Set<string>();
  let connectConfig: { url: string; token: string } | null = null;

  return {
    async start(onMessage) {
      onMessageHandler = onMessage;
      if (client?.connected) return getDirectRealtimeStatus(PLATFORM);

      if (client) {
        client.removeAllListeners();
        client.end(true);
        client = null;
      }

      connectConfig = await resolveObMqttConnectConfig();
      if (!connectConfig) {
        console.warn("[OB MQTT] no mqtt endpoint or token");
        patchDirectRealtimeStatus(PLATFORM, {
          upstreamConnected: false,
          lastError: "no mqtt endpoint or token",
        });
        return getDirectRealtimeStatus(PLATFORM);
      }

      const { url, token } = connectConfig;
      patchDirectRealtimeStatus(PLATFORM, { upstreamConnected: false, lastError: null });

      client = mqtt.connect(url, {
        username: token,
        clientId: OB_MQTT_CLIENT_ID,
        clean: true,
        keepalive: 30,
        reconnectPeriod: 5000,
        protocolId: "MQTT",
        protocolVersion: 4,
        connectTimeout: 15_000,
      });

      client.on("message", (topic: string, buf: Buffer) => {
        bumpDirectRealtimeMessage(PLATFORM);
        onMessageHandler?.({ topic, payload: buf.toString() });
      });

      client.on("error", (err: Error) => {
        console.warn("[OB MQTT] error", err.message, url);
        patchDirectRealtimeStatus(PLATFORM, {
          upstreamConnected: false,
          lastError: err.message,
        });
      });
      client.on("offline", () => {
        console.warn("[OB MQTT] offline", url);
        patchDirectRealtimeStatus(PLATFORM, { upstreamConnected: false });
      });
      client.on("reconnect", () => {
        console.debug("[OB MQTT] reconnecting...");
        patchDirectRealtimeStatus(PLATFORM, { upstreamConnected: false, lastError: null });
      });
      client.on("connect", () => {
        console.info("[OB MQTT] connected (direct)", url);
        patchDirectRealtimeStatus(PLATFORM, { upstreamConnected: true, lastError: null });
        syncObStatus(topics);
        for (const topic of topics) client?.subscribe(topic);
      });

      return getDirectRealtimeStatus(PLATFORM);
    },
    async stop() {
      topics.clear();
      client?.end(true);
      client = null;
      onMessageHandler = null;
      connectConfig = null;
      resetDirectRealtimeStatus(PLATFORM);
      return getDirectRealtimeStatus(PLATFORM);
    },
    async status() {
      return getDirectRealtimeStatus(PLATFORM);
    },
    async subscribe(topic) {
      topics.add(topic);
      syncObStatus(topics);
      if (client?.connected) {
        await new Promise<void>((resolve) => {
          client?.subscribe(topic, () => resolve());
        });
      }
    },
    async unsubscribe(topic) {
      topics.delete(topic);
      syncObStatus(topics);
      if (client?.connected) client.unsubscribe(topic);
    },
    connected() {
      return Boolean(client?.connected);
    },
  };
}

export function createObRealtimeClient(): ObRealtimeClient {
  return createDirectObRealtimeClient();
}
