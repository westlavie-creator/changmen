import mqtt, { type MqttClient } from "mqtt";
import {
  bumpDirectRealtimeMessage,
  getDirectRealtimeStatus,
  patchDirectRealtimeStatus,
  resetDirectRealtimeStatus,
  upstreamRouteFromUrl,
} from "@platform/shared/directRealtimeStatus";
import { PLATFORMS } from "@/shared/platform";
import { OB_A8_MQTT_PASSWORD, OB_A8_MQTT_USERNAME, OB_MQTT_CLIENT_ID, OB_MQTT_CONNECT_TIMEOUT_MS } from "./mqttConfig";
import {
  fetchObDemoMqttConfig,
  getObA8MqttConfig,
  getObChangmenMqttConfig,
  type ObMqttConnectConfig,
  type ObMqttEndpointSource,
} from "./mqttSession";

const PLATFORM = PLATFORMS.OB;

const FAILOVER_ORDER: ObMqttEndpointSource[] = ["demo", "changmen", "a8"];

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

function nextFailoverConfig(
  failedSource: ObMqttEndpointSource,
  lastDemo: ObMqttConnectConfig | null,
): ObMqttConnectConfig | null {
  const idx = FAILOVER_ORDER.indexOf(failedSource);
  const next = idx === -1 ? FAILOVER_ORDER[0]! : FAILOVER_ORDER[(idx + 1) % FAILOVER_ORDER.length]!;
  switch (next) {
    case "demo":
      return null;
    case "changmen":
      if (!lastDemo?.url || !lastDemo.username) return getObA8MqttConfig();
      return getObChangmenMqttConfig(lastDemo.url, lastDemo.username);
    case "a8":
      return getObA8MqttConfig();
    default:
      return null;
  }
}

function createDirectObRealtimeClient(): ObRealtimeClient {
  let client: MqttClient | null = null;
  let onMessageHandler: ((message: ObMqttMessage) => void) | null = null;
  const topics = new Set<string>();
  let activeConfig: ObMqttConnectConfig | null = null;
  let lastDemoConfig: ObMqttConnectConfig | null = null;
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

      if (failedSource === "a8") {
        console.warn("[OB MQTT] A8 relay failed, refreshing demo login:", reason);
        const demo = await fetchObDemoMqttConfig();
        if (demo) {
          lastDemoConfig = demo;
          await connectWithConfig(demo);
          return;
        }
        console.warn("[OB MQTT] demo refresh returned no endpoint, retrying A8 relay");
        await connectWithConfig(getObA8MqttConfig());
        return;
      }

      const nextConfig = nextFailoverConfig(failedSource, lastDemoConfig);
      if (!nextConfig) {
        const demo = await fetchObDemoMqttConfig();
        if (demo) {
          lastDemoConfig = demo;
          await connectWithConfig(demo);
        } else {
          await connectWithConfig(getObA8MqttConfig());
        }
        return;
      }

      console.warn(`[OB MQTT] ${failedSource} failed, switching to ${nextConfig.source}:`, reason);
      await connectWithConfig(nextConfig);
    } finally {
      failoverBusy = false;
    }
  };

  const connectWithConfig = async (config: ObMqttConnectConfig) => {
    if (stopped) return;

    tearDownClient();
    activeConfig = config;
    if (config.source === "demo") lastDemoConfig = config;

    const { url, username, password, source } = config;
    patchDirectRealtimeStatus(PLATFORM, {
      upstreamConnected: false,
      upstreamRoute: null,
      lastError: null,
    });

    client = mqtt.connect(url, {
      username: OB_A8_MQTT_USERNAME,
      password: OB_A8_MQTT_PASSWORD,
      clientId: OB_MQTT_CLIENT_ID,
      clean: true,
      keepalive: 60,
      reconnectPeriod: 5000,
      protocolId: "MQTT",
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
      // reconnectPeriod=5000: mqtt.js 会自动重连，close 不触发 failover
    });

    client.on("connect", () => {
      clearConnectTimer();
      console.info("[OB MQTT] connected", url, `(${source})`);
      patchDirectRealtimeStatus(PLATFORM, {
        upstreamConnected: true,
        upstreamRoute: upstreamRouteFromUrl(url, source),
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
        lastDemoConfig = demo;
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
      lastDemoConfig = null;
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
