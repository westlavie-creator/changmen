/**
 * 自动下单挑选。对齐 AutoYabo PodAuto1：
 * - 新警报就绪立刻打；seen 过的不再反复试
 * - 等馆内实时价（fromLive），真价仍由 place 路径 queryBetAmountPB 确认
 * - 同场闸门、优先更高 EV
 * 不设「挂几分钟冷票」窗口——时效在面板用短 maxAgeSec 管管道预算。
 */
import {
  podFollowPlaceBlock,
  type PodFollowPlaceTicket,
} from "@/runtime/podFollowPlace";
import { evaluatePodOutcomeGate, podOutcomeGateEntryFrom, type PodOutcomeGateEntry } from "./gate";
import { podYaboDailyLossBlocked } from "./loss";

/** 自动独有门控说明；null = 可进挑选（仍可能被 EV 排序挤掉）。 */
export function podYaboAutoSkipReason(
  ticket: PodFollowPlaceTicket,
  placedIds: Iterable<string> = [],
  placedEntries: Iterable<PodOutcomeGateEntry> = [],
  cap: { todayProfit?: number; openStake?: number; maxDailyLoss?: number } = {},
): string | null {
  if (podYaboDailyLossBlocked({
    todayProfit: Number(cap.todayProfit) || 0,
    openStake: Number(cap.openStake) || 0,
    maxDailyLoss: Number(cap.maxDailyLoss) || 0,
  }))
    return "触及当日亏损上限";
  if (new Set(placedIds).has(ticket.id))
    return "已下过";
  if (ticket.fixtureBasis !== "confirmed")
    return "身份未确认";
  if (!ticket.market.fromLive)
    return "等实时价";
  const block = podFollowPlaceBlock(ticket);
  if (block)
    return block;
  const gate = evaluatePodOutcomeGate(podOutcomeGateEntryFrom(ticket), [...placedEntries]);
  if (!gate.allow)
    return gate.reason || "同场闸门";
  return null;
}

export function pickPodYaboAutoTicket(
  tickets: PodFollowPlaceTicket[],
  placedIds: Iterable<string>,
  placedEntries: Iterable<PodOutcomeGateEntry> = [],
  cap: { todayProfit?: number; openStake?: number; maxDailyLoss?: number } = {},
): PodFollowPlaceTicket | null {
  const ready: PodFollowPlaceTicket[] = [];
  for (const ticket of tickets) {
    if (podYaboAutoSkipReason(ticket, placedIds, placedEntries, cap) != null)
      continue;
    ready.push(ticket);
  }
  ready.sort((a, b) => (Number(b.quote.evPercent) || 0) - (Number(a.quote.evPercent) || 0));
  return ready[0] || null;
}
