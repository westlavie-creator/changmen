/**
 * 自动下单挑选。对齐 AutoYabo：等实时价、同场闸门、优先更高 EV。默认仍由面板关着。
 */
import {
  podFollowPlaceBlock,
  type PodFollowPlaceTicket,
} from "@/runtime/podFollowPlace";
import { evaluatePodOutcomeGate, podOutcomeGateEntryFrom, type PodOutcomeGateEntry } from "./gate";

export function pickPodYaboAutoTicket(
  tickets: PodFollowPlaceTicket[],
  placedIds: Iterable<string>,
  placedEntries: Iterable<PodOutcomeGateEntry> = [],
): PodFollowPlaceTicket | null {
  const done = new Set(placedIds);
  const placed = [...placedEntries];
  const ready: PodFollowPlaceTicket[] = [];
  for (const ticket of tickets) {
    if (done.has(ticket.id))
      continue;
    if (podFollowPlaceBlock(ticket) != null)
      continue;
    if (ticket.market.fromLive !== true)
      continue;
    const gate = evaluatePodOutcomeGate(podOutcomeGateEntryFrom(ticket), placed);
    if (!gate.allow)
      continue;
    ready.push(ticket);
  }
  ready.sort((a, b) => (Number(b.quote.evPercent) || 0) - (Number(a.quote.evPercent) || 0));
  return ready[0] || null;
}
