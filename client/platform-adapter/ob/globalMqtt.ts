/**
 * OB 官网模式 MQTT：订阅全局 topic（/market/odds/update 等），
 * 所有比赛的赔率变化通过广播实时推送，不按 matchId 分别订阅。
 *
 * 与 A8 模式互斥：切换时断旧连新。
 */
import mqtt, { type MqttClient } from "mqtt";
import { PLATFORMS } from "@/shared/platform";
import { useOddsStore } from "@/stores/oddsStore";
import { parseObOddField } from "./parse";
import {
  bumpDirectRealtimeMessage,
  patchDirectRealtimeStatus,
  resetDirectRealtimeStatus,
  upstreamRouteFromUrl,
} from "@platform/shared/directRealtimeStatus";
import {
  OB_MQTT_CONNECT_TIMEOUT_MS,
} from "./mqttConfig";
import {
  fetchObDemoMqttConfig,
  getObA8MqttConfig,
  type ObMqttConnectConfig,
} from "./mqttSession";

const PLATFORM = PLATFORMS.OB;

const GLOBAL_TOPICS = [
  "/market/odds/update",
  "/market/status/update",
  "/odd/status/update",
  "/market/action/suspended",
  "/market/action/visible",
];

let client: MqttClient | null = null;
let _connected = false;
let _statusLabel = "";
let _msgCount = 0;
let _oddsUpdateCount = 0;
let _oddsAppliedCount = 0;
let _oddsDroppedCount = 0;
let _lastCountResetAt = Date.now();

function handleGlobalMessage(topic: string, buf: Buffer): void {
  _msgCount++;
  let rows: Array<Record<string, unknown>>;
  try {
    rows = JSON.parse(buf.toString());
  } catch {
    return;
  }
  if (!Array.isArray(rows)) return;

  const odds = useOddsStore();
  const now = Date.now();

  if (topic === "/market/odds/update") {
    _oddsUpdateCount++;
    for (const row of rows) {
      const id = String(row.id ?? "");
      if (!id) continue;
      if (!odds.isOdds(PLATFORM, id)) {
        _oddsDroppedCount++;
        continue;
      }
      const nextOdd = parseObOddField(row.odd);
      if (nextOdd <= 0) continue;
      const prev = odds.getEntry(PLATFORM, id);
      odds.save(
        PLATFORM,
        {
          id,
          odds: nextOdd,
          isLock: false,
          betId: String(row.market_id ?? prev?.betId ?? ""),
          side: prev?.side,
          time: now,
        },
        "mqtt",
      );
      _oddsAppliedCount++;
    }
  } else if (topic === "/market/status/update" || topic === "/market/action/suspended") {
    for (const row of rows) {
      const marketId = String(row.market_id ?? row.id ?? "");
      if (marketId) odds.updateBetLock(PLATFORM, marketId, true);
    }
  }
}

async function connectGlobal(): Promise<void> {
  stopObGlobalMqtt();

  const demo = await fetchObDemoMqttConfig();
  const config: ObMqttConnectConfig = demo ?? getObA8MqttConfig();

  _statusLabel = `${config.source}(global)`;
  console.info("[OB Global MQTT] connecting", config.url, config.source);

  client = mqtt.connect(config.url, {
    username: config.username,
    password: config.password,
    clientId: `cmglobal_${Date.now().toString(36)}`,
    clean: true,
    keepalive: 30,
    reconnectPeriod: 5000,
    protocolId: "MQTT",
    protocolVersion: 4,
    connectTimeout: OB_MQTT_CONNECT_TIMEOUT_MS,
  });

  client.on("connect", () => {
    _connected = true;
    console.info("[OB Global MQTT] connected, subscribing global topics");
    patchDirectRealtimeStatus(PLATFORM, {
      upstreamConnected: true,
      upstreamRoute: upstreamRouteFromUrl(config.url, config.source),
      lastError: null,
    });
    for (const t of GLOBAL_TOPICS) client?.subscribe(t);
  });

  client.on("message", (topic: string, buf: Buffer) => {
    bumpDirectRealtimeMessage(PLATFORM);
    handleGlobalMessage(topic, buf);
  });

  client.on("error", (err: Error) => {
    _connected = false;
    patchDirectRealtimeStatus(PLATFORM, {
      upstreamConnected: false,
      upstreamRoute: null,
      lastError: err.message,
    });
    console.warn("[OB Global MQTT] error:", err.message);
  });

  client.on("close", () => {
    _connected = false;
    patchDirectRealtimeStatus(PLATFORM, { upstreamConnected: false, upstreamRoute: null });
  });
}

export function startObGlobalMqtt(): void {
  void connectGlobal();
}

export function stopObGlobalMqtt(): void {
  _connected = false;
  _statusLabel = "";
  _msgCount = 0;
  _oddsUpdateCount = 0;
  _oddsAppliedCount = 0;
  _oddsDroppedCount = 0;
  _lastCountResetAt = Date.now();
  if (client) {
    client.removeAllListeners();
    client.end(true);
    client = null;
  }
  resetDirectRealtimeStatus(PLATFORM);
}

export function isObGlobalMqttConnected(): boolean {
  return _connected;
}

export function obGlobalMqttStatusLabel(): string {
  return _statusLabel;
}

export function obGlobalMqttDiag(): {
  msgCount: number;
  oddsUpdateCount: number;
  oddsAppliedCount: number;
  oddsDroppedCount: number;
  uptimeSec: number;
} {
  return {
    msgCount: _msgCount,
    oddsUpdateCount: _oddsUpdateCount,
    oddsAppliedCount: _oddsAppliedCount,
    oddsDroppedCount: _oddsDroppedCount,
    uptimeSec: Math.floor((Date.now() - _lastCountResetAt) / 1000),
  };
}
