import { saveVenueOdds, isVenueOdds, getVenueOddsEntry, updateVenueBetLock, updateVenueOddsMessage } from "@changmen/client-core/bridge/oddsAccess";
import type { ViewMatch } from "@changmen/client-core/models/match";
import { PLATFORMS } from "@venue/shared/platforms";
import { getObBetNameRe } from "./parse";
import { refreshObMatchMarkets } from "./markets";
import { parseObOddField } from "./parse";

import type { CollectPlatformInfo } from "@changmen/api-contract";
import {
  createObRealtimeClient,
  cycleObMqttSourceMode,
  getObMqttSourceMode,
  obMqttSourceModeLabel,
  type ObMqttSourceMode,
  type ObRealtimeClient,
} from "./realtime";

const PLATFORM = PLATFORMS.OB;

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

let realtime: ObRealtimeClient | null = null;
const subscribedIds = new Set<string>();
let onRefresh: (() => void) | null = null;
let refreshDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let latestCollectPlatform: CollectPlatformInfo | null = null;

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
  return Boolean(realtime?.connected());
}

export function isObMatchSubscribed(sourceMatchId: string): boolean {
  return subscribedIds.has(String(sourceMatchId));
}

export function setObMqttCollectPlatform(platform: CollectPlatformInfo | null): void {
  latestCollectPlatform = platform;
}

export function handleObMqttMessage(
  topic: string,
  payload: string,
  refresh: () => void = scheduleMqttRefresh,
  now = Date.now(),
) {

  updateVenueOddsMessage(PLATFORM, payload);
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
        if (!oddsId || !isVenueOdds(PLATFORM, oddsId)) continue;
        const nextOdd = parseObOddField(row.odd);
        if (nextOdd <= 0) continue;
        const prev = getVenueOddsEntry(PLATFORM, oddsId);
        saveVenueOdds(
          PLATFORM,
          {
            id: oddsId,
            odds: nextOdd,
            isLock: false,
            betId: String(row.market_id ?? prev?.betId ?? ""),
            side: prev?.side,
            time: now,
          },
          "mqtt",
        );
      }
      refresh();
      break;
    case "/market/statusUpdate/":
      for (const row of rows) {
        updateVenueBetLock(PLATFORM, String(row.market_id ?? ""), true);
      }
      refresh();
      break;
    case "/market/suspended/":
      for (const row of rows) {
        updateVenueBetLock(PLATFORM, String(row.market_id ?? ""), row.suspended === 1);
      }
      refresh();
      break;
    default:
      // /odd/*、/market/visible/ 等：A8 UMe 同样无 handler，仅订阅保持与源站一致
      break;
  }
}

export function connectObMqtt(refresh: () => void): void {
  onRefresh = refresh;
  if (!realtime) realtime = createObRealtimeClient();
  if (realtime.connected()) return;

  void realtime.start((message) => {
    handleObMqttMessage(message.topic, message.payload);
  }).then(() => {
    for (const id of subscribedIds) {
      for (const topic of obSubscribeTopics(id)) {
        void realtime?.subscribe(topic);
      }
    }
    scheduleMqttRefresh();
  });
}

export { getObMqttSourceMode, obMqttSourceModeLabel };
export type { ObMqttSourceMode };

export function cycleObMqttSourceModeAndReconnect(): ObMqttSourceMode {
  const next = cycleObMqttSourceMode();
  if (!realtime || !onRefresh) return next;

  const oldRealtime = realtime;
  realtime = null;
  void oldRealtime.stop().finally(() => {
    if (onRefresh) connectObMqtt(onRefresh);
  });
  return next;
}

export function disconnectObMqtt(): void {
  clearMqttRefreshDebounce();
  for (const id of [...subscribedIds]) {
    for (const topic of obSubscribeTopics(id)) {
      void realtime?.unsubscribe(topic);
    }
  }
  subscribedIds.clear();
  void realtime?.stop();
  realtime = null;
  latestCollectPlatform = null;
}

function subscribeObMatch(matchId: string): Promise<void> {
  return Promise.all(obSubscribeTopics(matchId).map((topic) => realtime?.subscribe(topic)))
    .then(() => undefined);
}

function unsubscribeObMatch(matchId: string): void {
  for (const topic of obSubscribeTopics(matchId)) {
    void realtime?.unsubscribe(topic);
  }
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
  const platform = latestCollectPlatform;
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
