import type { BetSide } from "@/models/match";
import { goeasySubscribe } from "@/realtime/goeasyClient";
import { PUBLISH_CHANNEL } from "@/realtime/publishBetting";
import { useLoseOrderStore } from "@/stores/loseOrderStore";
import { useUserStore } from "@/stores/userStore";

let publishSubscribed = false;

/** [A8 可证实] `uf.Publish`：跟单 Publisher 广播 → createFollowOrder */
function handlePublishMessage(content: string) {
  const user = useUserStore();
  if (!user.setting?.Follow)
    return;

  let envelope: {
    userId?: number;
    action?: string;
    data?: {
      matchId?: number;
      betId?: number;
      target?: BetSide;
      betMoney?: number;
      odds?: number;
    };
  };
  try {
    envelope = JSON.parse(content);
  }
  catch {
    return;
  }

  const publisherId = envelope.userId;
  if (!publisherId || publisherId === user.userId)
    return;

  const follow = user.follow;
  if (!follow?.isOpen)
    return;

  const users = follow.users ?? follow.publishers ?? [];
  if (!users.includes(publisherId))
    return;

  switch (envelope.action) {
    case "Betting": {
      const data = envelope.data;
      if (!data?.matchId || !data.betId || !data.target)
        return;
      if (follow.minMoney && follow.minMoney > (data.betMoney ?? 0))
        return;
      if (follow.maxMoney && follow.maxMoney < (data.betMoney ?? 0))
        return;
      useLoseOrderStore().createFollowOrder(
        {
          matchId: data.matchId,
          betId: data.betId,
          target: data.target,
          odds: Number(data.odds ?? 0),
        },
        follow,
      );
      break;
    }
    case "LoseOrder":
      break;
    default:
      break;
  }
}

/** 对齐 A8 GoEasy connect 后订阅 Publish 频道（全局一次） */
export async function ensurePublishChannelSubscribed(): Promise<void> {
  if (publishSubscribed)
    return;
  publishSubscribed = true;
  await goeasySubscribe(PUBLISH_CHANNEL, handlePublishMessage);
}
