import mqtt, { type MqttClient } from "mqtt";
import { getCollectPlatform } from "@/api/esport";
import type { ViewMatch } from "@/models/match";
import { PLATFORMS, OB_MQTT_PASS, OB_MQTT_USER, relayWsUrl } from "@/shared/platform";
import { getObBetNameRe } from "./parse";
import { refreshObMatchMarkets } from "./markets";
import { parseObOddField } from "./parse";
import { useOddsStore } from "@/stores/oddsStore";

const PLATFORM = PLATFORMS.OB;

/** 对齐 A8 UMe：固定 clientId（与 index.js 一致） */
const OB_MQTT_CLIENT_ID = "mqttjs_dj1250901313125773543";

function parseTopic(topic: string): { topic: string; matchId: string } | null {
  const m = /(.+?)(\d+)/.exec(topic);
  if (!m) return null;
  return { topic: m[1]!, matchId: m[2]! };
}

function obSubscribeTopics(matchId: string | number): string[] {
  const id = String(matchId);
  // 对齐 A8 `n9()`：订阅 odd/* + market/* 全量 topic；UMe message 仅处理 market 三 topic（见 wireMessageHandler）。
  return [
    `/odd/insert/${id}`,
    `/odd/statusUpdate/${id}`,
    `/odd/visible/${id}`,
    `/odd/suspended/${id}`,
    `/market/sortCodeUpdate/${id}`,
    `/market/suspended/${id}`,
    `/market/visible/${id}`,
    `/market/statusUpdate/${id}`,
    `/market/oddsUpdate/${id}`,
  ];
}

/** Client_GetMatchs 里 OB 的源赛事 id（Matchs.OB） */
export function obSourceMatchId(match: ViewMatch): string | null {
  const id = match.providers[PLATFORM];
  if (id == null || id === "") return null;
  return String(id);
}

let client: MqttClient | null = null;
const subscribedIds = new Set<string>();
let onRefresh: (() => void) | null = null;
let refreshDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let electronObConnected = false;
let removeElectronObMessageListener: (() => void) | null = null;

const MQTT_REFRESH_DEBOUNCE_MS = 200;

function scheduleMqttRefresh(): void {
  if (!onRefresh) return;
  if (refreshDebounceTimer) clearTimeout(refreshDebounceTimer);
  refreshDebounceTimer = setTimeout(() => {
    refreshDebounceTimer = null;
    onRefresh?.();
  }, MQTT_REFRESH_DEBOUNCE_MS);
}

function clearMqttRefreshDebounce(): void {
  if (refreshDebounceTimer) {
    clearTimeout(refreshDebounceTimer);
    refreshDebounceTimer = null;
  }
}

/** 是否已连上 OB relay；对齐 A8 仍每轮 HTTP 灌盘，MQTT 仅增量改 fo */
export function isObMqttConnected(): boolean {
  if (window.gamebetRelays?.ob) return electronObConnected;
  return Boolean(client?.connected);
}

export function isObMatchSubscribed(sourceMatchId: string): boolean {
  return subscribedIds.has(String(sourceMatchId));
}

function handleObMqttMessage(topic: string, payload: string) {
  const odds = useOddsStore();

  odds.updateMessage(PLATFORM, payload);
  const parsed = parseTopic(topic);
  if (!parsed) return;
  let rows: Array<Record<string, unknown>>;
  try {
    rows = JSON.parse(payload);
  } catch {
    return;
  }
  if (!Array.isArray(rows)) return;

  switch (parsed.topic) {
    case "/market/oddsUpdate/":
      for (const row of rows) {
        const oddsId = String(row.id ?? "");
        if (!oddsId || !odds.isOdds(PLATFORM, oddsId)) continue;
        const nextOdd = parseObOddField(row.odd);
        if (nextOdd <= 0) continue;
        const prev = odds.getEntry(PLATFORM, oddsId);
        odds.save(
          PLATFORM,
          {
            id: oddsId,
            odds: nextOdd,
            isLock: false,
            betId: String(row.market_id ?? prev?.betId ?? ""),
            side: prev?.side,
            time: Date.now(),
          },
          "mqtt",
        );
      }
      scheduleMqttRefresh();
      break;
    case "/market/statusUpdate/":
      for (const row of rows) {
        odds.updateBetLock(PLATFORM, String(row.market_id ?? ""), true);
      }
      scheduleMqttRefresh();
      break;
    case "/market/suspended/":
      for (const row of rows) {
        odds.updateBetLock(PLATFORM, String(row.market_id ?? ""), row.suspended === 1);
      }
      scheduleMqttRefresh();
      break;
    default:
      // /odd/*、/market/visible/ 等：A8 UMe 同样无 handler，仅订阅保持与源站一致
      break;
  }
}

function wireMessageHandler() {
  if (!client) return;

  client.on("message", (topic, buf) => {
    handleObMqttMessage(topic, buf.toString());
  });
}

export function connectObMqtt(refresh: () => void): void {
  onRefresh = refresh;
  if (window.gamebetRelays?.ob) {
    removeElectronObMessageListener?.();
    removeElectronObMessageListener = window.gamebetRelays.ob.onMessage((message) => {
      handleObMqttMessage(message.topic, message.payload);
    });
    electronObConnected = true;
    void window.gamebetRelays.ob.start().then((status) => {
      electronObConnected = Boolean(status.upstreamConnected);
      for (const id of subscribedIds) {
        for (const topic of obSubscribeTopics(id)) {
          void window.gamebetRelays?.ob.subscribe(topic);
        }
      }
      scheduleMqttRefresh();
    });
    return;
  }
  if (client?.connected) return;
  if (client) {
    client.removeAllListeners();
    client.end(true);
    client = null;
  }

  const wsUrl = relayWsUrl("/esport/ws/OB");
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

  wireMessageHandler();

  client.on("error", (err) => {
    console.warn("[OB MQTT] error", err.message, wsUrl);
  });
  client.on("offline", () => {
    console.warn("[OB MQTT] offline", wsUrl);
  });
  client.on("reconnect", () => {
    console.debug("[OB MQTT] reconnecting…");
  });

  client.on("connect", () => {
    console.info("[OB MQTT] connected", wsUrl);
    // mqtt.js 在 clean=true 下重连不会保留订阅，必须主动重订阅，否则会“断流”导致赔率长期停在旧值
    for (const id of subscribedIds) {
      client?.subscribe(obSubscribeTopics(id));
    }
    scheduleMqttRefresh();
  });
}

export function disconnectObMqtt(): void {
  clearMqttRefreshDebounce();
  if (window.gamebetRelays?.ob) {
    for (const id of [...subscribedIds]) {
      for (const topic of obSubscribeTopics(id)) {
        void window.gamebetRelays.ob.unsubscribe(topic);
      }
    }
    subscribedIds.clear();
    removeElectronObMessageListener?.();
    removeElectronObMessageListener = null;
    electronObConnected = false;
    void window.gamebetRelays.ob.stop();
    return;
  }
  for (const id of [...subscribedIds]) {
    if (client?.connected) client.unsubscribe(obSubscribeTopics(id));
  }
  subscribedIds.clear();
  client?.end(true);
  client = null;
}

function subscribeObMatch(matchId: string): Promise<void> {
  if (window.gamebetRelays?.ob) {
    return Promise.all(
      obSubscribeTopics(matchId).map((topic) => window.gamebetRelays!.ob.subscribe(topic)),
    ).then(() => undefined);
  }
  return new Promise((resolve) => {
    if (!client?.connected) {
      resolve();
      return;
    }
    client.subscribe(obSubscribeTopics(matchId), () => resolve());
  });
}

function unsubscribeObMatch(matchId: string): void {
  if (window.gamebetRelays?.ob) {
    for (const topic of obSubscribeTopics(matchId)) {
      void window.gamebetRelays.ob.unsubscribe(topic);
    }
    return;
  }
  if (!client?.connected) return;
  client.unsubscribe(obSubscribeTopics(matchId));
}

/** A8 UMe：灌盘前 unsub 该场全部 topic */
export function unsubscribeObMatchBeforeView(matchId: string): void {
  unsubscribeObMatch(String(matchId));
}

/** A8 UMe：灌盘后 subscribe；未连线也记入 subscribedIds，connect 时重订 */
export async function subscribeObMatchAfterView(matchId: string): Promise<void> {
  const id = String(matchId);
  subscribedIds.add(id);
  await subscribeObMatch(id);
}

/**
 * Client_GetMatchs：界面上的 OB 场，每场 unsub → game/view → sub（与轮询一致）。
 */
export async function syncObMqttFromGetMatchs(
  matches: ViewMatch[],
  prepareMatch: (sourceMatchId: string, match: ViewMatch) => Promise<void>,
): Promise<void> {
  const target = new Set<string>();
  const byId = new Map<string, ViewMatch>();
  for (const match of matches) {
    const id = obSourceMatchId(match);
    if (!id) continue;
    target.add(id);
    byId.set(id, match);
  }

  for (const id of subscribedIds) {
    if (target.has(id)) continue;
    unsubscribeObMatch(id);
    subscribedIds.delete(id);
  }

  for (const id of target) {
    const match = byId.get(id);
    if (!match) continue;
    unsubscribeObMatchBeforeView(id);
    await prepareMatch(id, match);
    await subscribeObMatchAfterView(id);
  }
}

/** Client_GetMatchs 拉完后：只订列表里的 OB 场；新场灌 fo 后 subscribe */
export async function syncObMqttSubscriptionsForGetMatchs(matches: ViewMatch[]): Promise<void> {
  const platform = await getCollectPlatform(PLATFORM);
  if (!platform?.Gateway) return;
  const betRe = getObBetNameRe(platform.BetName);

  await syncObMqttFromGetMatchs(matches, async (sourceMatchId, match) => {
    await refreshObMatchMarkets(platform, sourceMatchId, match, betRe);
  });
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    disconnectObMqtt();
  });
}
