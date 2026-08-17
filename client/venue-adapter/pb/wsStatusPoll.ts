/**
 * [changmen 扩展] 把 Chrome 扩展 PB sports-websocket 观测状态报到右上角角标，
 * 并把 latestOdds 灌入影子价表（**不写** fo / 不改主价）。
 *
 * 影子价灌入由本机偏好 pbWsShadowUi 控制（默认关）；关则清空旁显，主价仍只走 HTTP fo。
 */
import { a8PluginSend, hasA8PluginRuntime } from "@changmen/client-core/chrome-plugin/bridge";
import { reportVenueWsStatus, type VenueWsStatus } from "../shared/venueWsStatus";
import {
  clearPbWsShadow,
  countPbWsShadowBySource,
  getPbWsShadow,
  listPbWsShadowIds,
  listPbWsShadowIdsBySource,
  replacePbWsShadowFromBoard,
  type PbWsBoardCard,
} from "./wsShadowOdds";

/** 旁显跟手：50ms 拉扩展板；hook 侧 WS/euro 立即 flush */
const POLL_MS = 50;
const PB_WS_ID = "pb";

/** 用户扩展偏好：主站是否显示 WS 影子价（默认关） */
let shadowUiAllowed = false;

/** 由 web userStore 在加载/保存扩展偏好时同步 */
export function setPbWsShadowUiAllowed(on: boolean): void {
  const next = on === true;
  if (shadowUiAllowed === next) {
    // 关着也清一次：避免 false→false 早退时残留旁显表
    if (!next)
      clearPbWsShadow();
    return;
  }
  shadowUiAllowed = next;
  if (!next)
    clearPbWsShadow();
}

export function isPbWsShadowUiAllowed(): boolean {
  return shadowUiAllowed;
}

type PbWsObserveBag = {
  enabled?: boolean;
  observe?: {
    connected?: boolean;
    running?: boolean;
    phase?: string;
    lastError?: string;
    readyState?: number;
    latestOdds?: PbWsBoardCard[];
  } | null;
};

/** 导出供单测；角标四态 */
export function mapObserveToStatus(bag: PbWsObserveBag | null | undefined): VenueWsStatus {
  if (!bag) return "disconnected";
  const o = bag.observe || {};
  // 与 hook 一致：socket OPEN 即已连接（勿只信可能被 hook_start 写脏的 connected 布尔）
  if (o.connected === true || o.readyState === 1)
    return "connected";
  if (o.lastError)
    return "error";
  if (
    bag.enabled === true
    || o.running === true
    || o.phase === "hook_start"
    || o.phase === "hooked"
    || o.phase === "wait_connected"
    || o.phase === "connected"
  ) {
    return "connecting";
  }
  return "disconnected";
}

/**
 * 一键找旁显 M。用法：`__CM_PB_FIND_M__()`
 * - 有可见 M：滚过去并绿描边
 * - 仅有「同 event 但已是 H」：黄描边（fo 已漂移，等新 WS）
 * - 都不在 DOM：返回 map 里的 eventId，方便切滚球/搜场
 */
function installFindMHelper(): void {
  try {
    const g = globalThis as {
      __CM_PB_FIND_M__?: () => Record<string, unknown>;
    };
    // 每次覆盖，避免 HMR / 旧闭包残留
    g.__CM_PB_FIND_M__ = () => {
      const bySource = countPbWsShadowBySource();
      const mapMIds = listPbWsShadowIdsBySource("M");
      const mapMEventIds = [
        ...new Set(mapMIds.map((id) => id.split("|")[0]!).filter(Boolean)),
      ];

      const allShadows = [
        ...document.querySelectorAll<HTMLElement>(".pb-ws-shadow"),
      ];
      const mNodes = allShadows.filter((el) =>
        /^M/i.test((el.textContent || "").trim())
          || el.dataset.shadowSrc === "M",
      );
      const hNodesOnMapM = allShadows.filter((el) => {
        if (!(/^H/i.test((el.textContent || "").trim()) || el.dataset.shadowSrc === "H"))
          return false;
        const eid = (el.dataset.oddId || "").split("|")[0] || "";
        return eid !== "" && mapMEventIds.includes(eid);
      });

      const outline = (nodes: HTMLElement[], color: string) => {
        for (const el of nodes) {
          const cell = el.closest(".item-odds") as HTMLElement | null;
          if (!cell) continue;
          cell.style.outline = `2px solid ${color}`;
          cell.style.outlineOffset = "1px";
          window.setTimeout(() => {
            cell.style.outline = "";
            cell.style.outlineOffset = "";
          }, 4000);
        }
      };

      let scrolled = false;
      let focus: "visible_M" | "same_event_H" | "not_in_list" | "no_M" = "no_M";

      if (mNodes.length > 0) {
        focus = "visible_M";
        outline(mNodes, "#3dd68c");
        mNodes[0]!.scrollIntoView({ behavior: "smooth", block: "center" });
        scrolled = true;
      } else if (hNodesOnMapM.length > 0) {
        focus = "same_event_H";
        outline(hNodesOnMapM, "#e3b341");
        hNodesOnMapM[0]!.scrollIntoView({ behavior: "smooth", block: "center" });
        scrolled = true;
      } else if (bySource.M > 0) {
        focus = "not_in_list";
      }

      const tip =
        focus === "visible_M"
          ? undefined
          : focus === "same_event_H"
            ? "列表里有同 event，但旁显已是 H（fo 比旧 WS 新）；等 part888 再推价应变回 M"
            : focus === "not_in_list"
              ? `表有 M×${bySource.M}，当前列表没有这些 event。可搜/滚到：${mapMEventIds.slice(0, 6).join(", ")}`
              : "影子表尚无 M：确认 part888 观测开着且有 UPDATE_ODDS";

      return {
        visibleM: mNodes.length,
        visibleHOnMapMEvents: hNodesOnMapM.length,
        mapM: bySource.M,
        mapH: bySource.H,
        sampleM: mapMIds.slice(0, 8),
        mapMEventIds: mapMEventIds.slice(0, 12),
        sample: mNodes.slice(0, 12).map((el) => (el.textContent || "").trim()),
        scrolled,
        focus,
        tip,
      };
    };
  } catch {
    /* ignore */
  }
}

function writeDebug(patch: Record<string, unknown>): void {
  try {
    installFindMHelper();
    const g = globalThis as { __CM_PB_SHADOW_DEBUG__?: Record<string, unknown> };
    g.__CM_PB_SHADOW_DEBUG__ = {
      ...(g.__CM_PB_SHADOW_DEBUG__ || {}),
      ...patch,
      findM: "控制台执行 __CM_PB_FIND_M__()：滚动到可见 M 并描边 4s",
      at: Date.now(),
    };
  } catch {
    /* ignore */
  }
}

/** 仅当用户开了影子价且扩展观测开才灌旁显；绝不写 fo */
export function ingestShadow(bag: PbWsObserveBag | null | undefined): void {
  if (!shadowUiAllowed) {
    clearPbWsShadow();
    writeDebug({
      shadowUiAllowed: false,
      enabled: bag?.enabled === true,
      reason: "prefs_shadow_off",
      shadowIds: 0,
    });
    return;
  }
  if (!bag?.enabled) {
    clearPbWsShadow();
    writeDebug({ shadowUiAllowed: true, enabled: false, reason: "observe_off", shadowIds: 0 });
    return;
  }
  const o = bag.observe || {};
  if (o.phase === "off") {
    clearPbWsShadow();
    writeDebug({ shadowUiAllowed: true, enabled: true, reason: "phase_off", shadowIds: 0 });
    return;
  }
  const cards = o.latestOdds;
  if (!Array.isArray(cards) || !cards.length) {
    writeDebug({
      shadowUiAllowed: true,
      enabled: true,
      reason: "empty_board_keep",
      phase: o.phase,
      connected: o.connected,
      shadowIds: listPbWsShadowIds().length,
    });
    return;
  }
  if (!shadowUiAllowed) {
    clearPbWsShadow();
    return;
  }
  replacePbWsShadowFromBoard(cards);
  if (!shadowUiAllowed) {
    clearPbWsShadow();
    return;
  }
  const bySource = countPbWsShadowBySource();
  const shadowIds = listPbWsShadowIds();
  const boardEventIds = [
    ...new Set(cards.map((c) => String(c.eventId ?? "")).filter(Boolean)),
  ];
  writeDebug({
    shadowUiAllowed: true,
    enabled: true,
    reason: "ok",
    cardCount: cards.length,
    boardEventIds: boardEventIds.slice(0, 12),
    sampleEventIds: cards.slice(0, 5).map((c) => c.eventId),
    sampleRot: cards.slice(0, 5).map((c) => c.rotNum || ""),
    shadowIds: shadowIds.length,
    bySource,
    sampleShadowIds: shadowIds.slice(0, 8),
    sampleM: shadowIds.filter((id) => getPbWsShadow(id)?.source === "M").slice(0, 8),
    hint:
      bySource.M === 0
        ? "board_ok_but_no_M_patches"
        : "M_exists_in_map__UI_shows_H_when_row_HomeID_event_not_in_board",
  });
}

async function pollOnce(): Promise<void> {
  if (!hasA8PluginRuntime()) {
    reportVenueWsStatus(PB_WS_ID, "disconnected");
    clearPbWsShadow();
    writeDebug({ reason: "no_plugin" });
    return;
  }
  try {
    const bag = (await a8PluginSend({ type: "pbWsObserveGet" })) as PbWsObserveBag;
    reportVenueWsStatus(PB_WS_ID, mapObserveToStatus(bag));
    ingestShadow(bag);
  } catch (err) {
    reportVenueWsStatus(PB_WS_ID, "disconnected");
    writeDebug({
      reason: "poll_error_keep",
      error: err instanceof Error ? err.message : String(err),
      shadowIds: listPbWsShadowIds().length,
    });
  }
}

/** 与 PB collector 同生命周期；返回 stop */
export function startPbWsStatusPoll(): () => void {
  let stopped = false;
  const tick = async () => {
    while (!stopped) {
      await pollOnce();
      await new Promise<void>((r) => setTimeout(r, POLL_MS));
    }
  };
  void tick();
  return () => {
    stopped = true;
    reportVenueWsStatus(PB_WS_ID, "disconnected");
    clearPbWsShadow();
  };
}