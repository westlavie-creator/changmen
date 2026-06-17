import { PUBLISH_CHANNEL } from "@/realtime/publishBetting";
import { goeasySubscribe } from "@/realtime/goeasyClient";
import type { BetSide } from "@/models/match";
import type { ScorePlatformPayload } from "@/types/matchScore";
import type { FollowConfig } from "@/types/order";
import { useLoseOrderStore } from "@/stores/loseOrderStore";
import { useMatchStore } from "@/stores/matchStore";
import { useUserStore } from "@/stores/userStore";

/** 对齐 A8 bundle `tp` 频道名 */
export const BET_TARGET_CHANNEL = "BetTarget";
export const SCORE_CHANNEL = "Score";

export interface PublishFollowEnvelope {
  userId?: number;
  action?: string;
  data?: FollowBettingPayload;
}

export interface FollowBettingPayload {
  provider?: string;
  matchId: number;
  betId: number;
  target: BetSide;
  betMoney: number;
  odds: number;
}

let globalChannelsBound = false;

/** 对齐 A8 `j8e`：连接后订阅 BetTarget / Score / Publish */
export async function ensureGoEasyGlobalChannels(): Promise<void> {
  if (globalChannelsBound) return;
  globalChannelsBound = true;
  await Promise.all([
    goeasySubscribe(BET_TARGET_CHANNEL, handleBetTargetMessage),
    goeasySubscribe(SCORE_CHANNEL, handleScoreMessage),
    goeasySubscribe(PUBLISH_CHANNEL, handlePublishMessage),
  ]);
}

/** @internal 测试重置 */
export function resetGoEasyGlobalChannelsForTest(): void {
  globalChannelsBound = false;
}

function handleBetTargetMessage(raw: string) {
  try {
    const payload = JSON.parse(raw) as Record<string, Record<string, BetSide>>;
    useMatchStore().applyRemoteBetTarget(payload);
  } catch {
    /* ignore malformed payload */
  }
}

function handleScoreMessage(raw: string) {
  try {
    const payload = JSON.parse(raw) as ScorePlatformPayload;
    if (payload?.platform && Array.isArray(payload.rows)) {
      useMatchStore().updateScore(payload.platform, payload.rows);
    }
  } catch {
    /* ignore malformed payload */
  }
}

/** 对齐 A8 `tp.Publish`：跟单入补单队列 */
export function handlePublishFollowMessage(
  raw: string,
  deps: {
    user: {
      userId: number;
      setting?: Record<string, unknown>;
      follow: FollowConfig | null;
    };
    createFollowOrder: (
      seed: FollowBettingPayload,
      follow: FollowConfig,
    ) => void;
  },
): void {
  if (!deps.user.setting?.Follow) return;

  let envelope: PublishFollowEnvelope;
  try {
    envelope = JSON.parse(raw) as PublishFollowEnvelope;
  } catch {
    return;
  }

  const publisherId = envelope.userId;
  if (publisherId == null) return;
  if (deps.user.userId === publisherId) return;

  const follow = deps.user.follow;
  if (!follow?.isOpen) return;

  const followedUsers = follow.users ?? follow.publishers ?? [];
  if (!followedUsers.includes(publisherId)) return;

  if (envelope.action !== "Betting" || !envelope.data) return;

  const data = envelope.data;
  if (follow.minMoney && follow.minMoney > data.betMoney) return;
  if (follow.maxMoney && follow.maxMoney < data.betMoney) return;

  deps.createFollowOrder(data, follow);
}

function handlePublishMessage(raw: string) {
  const user = useUserStore();
  const loseStore = useLoseOrderStore();
  handlePublishFollowMessage(raw, {
    user: {
      userId: user.userId,
      setting: user.setting,
      follow: user.follow,
    },
    createFollowOrder: (seed, follow) => loseStore.createFollowOrder(seed, follow),
  });
}
