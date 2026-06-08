import { PLATFORMS } from "@/shared/platform";
import { useMatchStore } from "@/stores/matchStore";
import { useOddsStore } from "@/stores/oddsStore";
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
    odds.updateBetLock(PLATFORM, String(playId), content.status !== 1);
    matchStore.refreshOddsOnBets();
    return;
  }

  if (type === "message_type_push_point_change") {
    const pointId = String(content.point_id ?? "");
    if (!pointId || !odds.isOdds(PLATFORM, pointId)) return;
    odds.save(PLATFORM, {
      id: pointId,
      odds: Number(content.point) || 0,
      isLock: false,
      betId: String(content.play_id ?? ""),
      time: now,
    });
    matchStore.refreshOddsOnBets();
  }
}
