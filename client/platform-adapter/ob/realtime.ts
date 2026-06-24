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
  getObChangmenMqttConfig,
  type ObMqttConnectConfig,
  type ObMqttEndpointSource,
} from "./mqttSession";

const PLATFORM = PLATFORMS.OB;

export type ObMqttSourceMode = "official" | "a8";

const OB_MQTT_SOURCE_MODE_KEY = "changmen:ob:mqtt-source-mode";
const OFFICIAL_FAILOVER_ORDER: ObMqttEndpointSource[] = ["demo", "changmen"];

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

function readStoredSourceMode(): ObMqttSourceMode {
  try {
    const value = globalThis.localStorage?.getItem(OB_MQTT_SOURCE_MODE_KEY);
    return value === "a8" ? "a8" : "official";
  } catch {
    return "official";
  }
}

let obMqttSourceMode: ObMqttSourceMode = readStoredSourceMode();

export function getObMqttSourceMode(): ObMqttSourceMode {
  return obMqttSourceMode;
}

export function setObMqttSourceMode(mode: ObMqttSourceMode): ObMqttSourceMode {
  obMqttSourceMode = mode;
  try {
    globalThis.localStorage?.setItem(OB_MQTT_SOURCE_MODE_KEY, mode);
  } catch {
    /* ignore storage errors */
  }
  patchDirectRealtimeStatus(PLATFORM, {
    upstreamConnected: false,
    upstreamRoute: mode === "a8" ? "a8" : "official",
    lastError: `OB MQTT 切换到${mode === "a8" ? "A8" : "官方"}源，等待重连`,
  });
  return obMqttSourceMode;
}

export function toggleObMqttSourceMode(): ObMqttSourceMode {
  return setObMqttSourceMode(obMqttSourceMode === "a8" ? "official" : "a8");
}

function syncObStatus(topics: Set<string>): void {
  patchDirectRealtimeStatus(PLATFORM, { forwardedTopics: topics.size });
}

function nextFailoverConfig(
  failedSource: ObMqttEndpointSource,
  lastDemo: ObMqttConnectConfig | null,
): ObMqttConnectConfig | null {
  const idx = OFFICIAL_FAILOVER_ORDER.indexOf(failedSource);
  const next = idx === -1
    ? OFFICIAL_FAILOVER_ORDER[0]!
    : OFFICIAL_FAILOVER_ORDER[(idx + 1) % OFFICIAL_FAILOVER_ORDER.length]!;
  switch (next) {
    case "demo":
      return null;
    case "changmen":
      if (!lastDemo?.url || !lastDemo.clientId) return getObA8MqttConfig();
      return getObChangmenMqttConfig(lastDemo.url, lastDemo);
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

  const mqttOptionsForConfig = (config: ObMqttConnectConfig) => {
    const clientId = config.clientId || (config.source === "a8" ? OB_MQTT_CLIENT_ID : "");
    if (!clientId) return null;
    return {
      username: config.username,
      password: config.password,
      clientId,
      clean: true,
      keepalive: 60,
      reconnectPeriod: 5000,
      protocolId: "MQTT" as const,
      connectTimeout: OB_MQTT_CONNECT_TIMEOUT_MS,
    };
  };

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

      const sourceMode = getObMqttSourceMode();
      if (sourceMode === "a8") {
        console.warn("[OB MQTT] A8 source failed, staying on selected A8 source:", reason);
        return;
      }

      if (failedSource === "a8") {
        console.warn("[OB MQTT] A8 relay failed while official source is selected, refreshing demo login:", reason);
        const demo = await fetchObDemoMqttConfig();
        if (demo) {
          lastDemoConfig = demo;
          await connectWithConfig(demo);
          return;
        }
        console.warn("[OB MQTT] demo refresh returned no endpoint, staying on official source");
        return;
      }

      const nextConfig = nextFailoverConfig(failedSource, lastDemoConfig);
      if (!nextConfig) {
        const demo = await fetchObDemoMqttConfig();
        if (demo) {
          lastDemoConfig = demo;
          await connectWithConfig(demo);
        }
        return;
      }

      if (nextConfig.source === "a8") return;

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

    const { url, source } = config;
    patchDirectRealtimeStatus(PLATFORM, {
      upstreamConnected: false,
      upstreamRoute: null,
      lastError: null,
    });

    const options = mqttOptionsForConfig(config);
    if (!options) {
      patchDirectRealtimeStatus(PLATFORM, {
        upstreamConnected: false,
        upstreamRoute: null,
        lastError: "missing OB MQTT clientId",
      });
      requestFailover("missing OB MQTT clientId");
      return;
    }

    client = mqtt.connect(url, options);

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

      if (getObMqttSourceMode() === "a8") {
        await connectWithConfig(getObA8MqttConfig());
      } else {
        const demo = await fetchObDemoMqttConfig();
        if (demo) {
          lastDemoConfig = demo;
          await connectWithConfig(demo);
        } else {
          console.warn("[OB MQTT] no official demo endpoint");
          patchDirectRealtimeStatus(PLATFORM, {
            upstreamConnected: false,
            upstreamRoute: "official",
            lastError: "no official OB MQTT endpoint",
          });
        }
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
