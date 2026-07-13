import type { BetSide } from "@/models/match";
import { goeasySubscribe } from "@/realtime/goeasyClient";
import { BET_TARGET_CHANNEL } from "@/realtime/betTargetPublish";
import { useMatchStore } from "@/stores/matchStore";

let betTargetSubscribed = false;

function handleBetTargetMessage(content: string) {
  let raw: Record<string, Record<string, BetSide>>;
  try {
    raw = JSON.parse(content) as Record<string, Record<string, BetSide>>;
  }
  catch {
    return;
  }
  if (!raw || typeof raw !== "object")
    return;
  useMatchStore().applyRemoteBetTarget(raw);
}

/** 对齐 A8 GoEasy connect 后订阅 BetTarget 频道（全局一次） */
export async function ensureBetTargetChannelSubscribed(): Promise<void> {
  if (betTargetSubscribed)
    return;
  betTargetSubscribed = true;
  await goeasySubscribe(BET_TARGET_CHANNEL, handleBetTargetMessage);
}
