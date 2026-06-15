import { PLATFORMS } from "@/shared/platform";
import { useMatchStore } from "@/stores/matchStore";
import { useOddsStore } from "@/stores/oddsStore";
import { iaWsPlayLocked } from "@platform/ia/shared/parse_fields";
import type { IaRealtimeMessage } from "./realtime";

const PLATFORM = PLATFORMS.IA;

export function handleIaRealtimeMessage(msg: IaRealtimeMessage, now = Date.now()): void {
  const odds = useOddsStore();
  const matchStore = useMatchStore();
  const type = msg.message_type;
  const content = (msg.content ?? {}) as Record<string, unknown>;

  if (type === "message_type_bet_item_single_lock") {
    const playId = content.play_id;
    if (!playId) return;
    odds.updateBetLock(PLATFORM, String(playId), iaWsPlayLocked(content.status));
    matchStore.refreshOddsOnBets();
    return;
  }

  if (type === "message_type_push_point_change") {
    const pointId = String(content.point_id ?? "");
    if (!pointId || !odds.isOdds(PLATFORM, pointId)) return;
    const existing = odds.getEntry(PLATFORM, pointId);
    // [A8 可证实] push 恒写 isLock=false；滚球赔率靠推送刷新，封盘靠 single_lock / HTTP
    odds.save(
      PLATFORM,
      {
        id: pointId,
        odds: Number(content.point) || 0,
        isLock: false,
        betId: String(content.play_id ?? existing?.betId ?? ""),
        side: existing?.side,
        time: now,
      },
      "mqtt",
    );
    matchStore.refreshOddsOnBets();
  }
}
