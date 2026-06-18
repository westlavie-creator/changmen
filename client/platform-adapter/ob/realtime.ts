import mqtt, { type MqttClient } from "mqtt";
import {
  bumpDirectRealtimeMessage,
  getDirectRealtimeStatus,
  patchDirectRealtimeStatus,
  resetDirectRealtimeStatus,
  upstreamRouteFromUrl,
} from "@platform/shared/directRealtimeStatus";
import { PLATFORMS } from "@/shared/platform";
import { OB_MQTT_CLIENT_ID, OB_MQTT_CONNECT_TIMEOUT_MS } from "./mqttConfig";
import {
  fetchObDemoMqttConfig,
  getObA8MqttConfig,
  type ObMqttConnectConfig,
  type ObMqttEndpointSource,
} from "./mqttSession";

const PLATFORM = PLATFORMS.OB;

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
  let activeConfig: ObMqttConnectConfig | null = null;
  let stopped = false;
  let failoverBusy = false;
  let intentionalDisconnect = false;
  let connectTimer: ReturnType<typeof setTimeout> | null = null;

  const clearConnectTimer = () => {
    if (connectTimer) {
      clearTimeout(connectTimer);
      connectTimer = null;
    }
  };

  const tearDownClient = () => {
    clearConnectTimer();
    if (!client) return;
    intentionalDisconnect = true;
    client.removeAllListeners();
    client.end(true);
    client = null;
    intentionalDisconnect = false;
  };

  const requestFailover = (reason: string) => {
    if (stopped || failoverBusy || intentionalDisconnect) return;
    const failedSource = activeConfig?.source;
    if (!failedSource) return;
    void failoverFrom(failedSource, reason);
  };

  const failoverFrom = async (failedSource: ObMqttEndpointSource, reason: string) => {
    if (stopped || failoverBusy) return;
    failoverBusy = true;
    try {
      tearDownClient();
      activeConfig = null;
      patchDirectRealtimeStatus(PLATFORM, {
        upstreamConnected: false,
        upstreamRoute: null,
        lastError: reason,
      });

      if (failedSource === "demo") {
        console.warn("[OB MQTT] demo endpoint failed, switching to A8 relay:", reason);
        await connectWithConfig(getObA8MqttConfig());
        return;
      }

      console.warn("[OB MQTT] A8 relay failed, refreshing demo login:", reason);
      const demo = await fetchObDemoMqttConfig();
      if (demo) {
        await connectWithConfig(demo);
        return;
      }

      console.warn("[OB MQTT] demo refresh returned no endpoint, retrying A8 relay");
      await connectWithConfig(getObA8MqttConfig());
    } finally {
      failoverBusy = false;
    }
  };

  const connectWithConfig = async (config: ObMqttConnectConfig) => {
    if (stopped) return;

    tearDownClient();
    activeConfig = config;
    const { url, username, password, source } = config;
    patchDirectRealtimeStatus(PLATFORM, {
      upstreamConnected: false,
      upstreamRoute: null,
      lastError: null,
    });

    client = mqtt.connect(url, {
      username,
      password,
      clientId: OB_MQTT_CLIENT_ID,
      clean: true,
      keepalive: 30,
      reconnectPeriod: 0,
      protocolId: "MQTT",
      protocolVersion: 4,
      connectTimeout: OB_MQTT_CONNECT_TIMEOUT_MS,
    });

    client.on("message", (topic: string, buf: Buffer) => {
      bumpDirectRealtimeMessage(PLATFORM);
      onMessageHandler?.({ topic, payload: buf.toString() });
    });

    client.on("error", (err: Error) => {
      console.warn("[OB MQTT] error", err.message, url, `(${source})`);
      patchDirectRealtimeStatus(PLATFORM, {
        upstreamConnected: false,
        upstreamRoute: null,
        lastError: err.message,
      });
      requestFailover(err.message);
    });

    client.on("close", () => {
      patchDirectRealtimeStatus(PLATFORM, { upstreamConnected: false, upstreamRoute: null });
      requestFailover("connection closed");
    });

    client.on("connect", () => {
      clearConnectTimer();
      console.info("[OB MQTT] connected", url, `(${source})`);
      patchDirectRealtimeStatus(PLATFORM, {
        upstreamConnected: true,
        upstreamRoute: upstreamRouteFromUrl(url),
        lastError: null,
      });
      syncObStatus(topics);
      for (const topic of topics) client?.subscribe(topic);
    });

    connectTimer = setTimeout(() => {
      if (stopped || client?.connected) return;
      console.warn("[OB MQTT] connect timeout", url, `(${source})`);
      requestFailover("connect timeout");
    }, OB_MQTT_CONNECT_TIMEOUT_MS);
  };

  return {
    async start(onMessage) {
      onMessageHandler = onMessage;
      stopped = false;

      if (client?.connected) return getDirectRealtimeStatus(PLATFORM);

      const demo = await fetchObDemoMqttConfig();
      if (demo) {
        await connectWithConfig(demo);
      } else {
        console.warn("[OB MQTT] no demo endpoint, starting with A8 relay");
        await connectWithConfig(getObA8MqttConfig());
      }

      return getDirectRealtimeStatus(PLATFORM);
    },
    async stop() {
      stopped = true;
      topics.clear();
      tearDownClient();
      onMessageHandler = null;
      activeConfig = null;
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
