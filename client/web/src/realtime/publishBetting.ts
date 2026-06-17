import type { BetOption } from "@/models/betOption";
import { ensureGoEasyConnected, goeasyPublish } from "@/realtime/goeasyClient";
import { useUserStore } from "@/stores/userStore";

/** [A8 可证实] bundle `z8e="Publish"` + `q8e` */
export const PUBLISH_CHANNEL = "Publish";

/** 下单成功且用户为 Publisher 时广播（对齐 A8 `q8e`） */
export async function publishBettingEvent(option: BetOption): Promise<boolean> {
  const user = useUserStore();
  if (!user.setting?.Publisher) return false;
  if (!option.match || !option.bet) return false;

  const payload = {
    userId: user.userId ?? 0,
    action: "Betting",
    data: {
      provider: option.type,
      matchId: option.match.id,
      betId: option.bet.id,
      target: option.target,
      betMoney: option.betMoney,
      odds: option.odds,
    },
  };

  await ensureGoEasyConnected();
  return goeasyPublish(PUBLISH_CHANNEL, JSON.stringify(payload));
}
