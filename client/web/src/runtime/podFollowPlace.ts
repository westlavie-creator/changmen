/**
 * POD 跟单下单门控。猜测身份；自动默认关。不进电竞 mainBetLoop。
 */
import type { PodObQuoteCompare, PodMarketMatch } from "@/runtime/podMarketMatch";
import { placeObSportSingle } from "@/runtime/obSportPlaceBet";

export type PodFollowPlaceTicket = {
  id: string;
  stake: number;
  fixtureStatus: string;
  obMid: string;
  market: Pick<PodMarketMatch, "status" | "ob" | "locked" | "oid" | "quote">;
  quote: PodObQuoteCompare;
};

export function podFollowPlaceBlock(ticket: PodFollowPlaceTicket): string | null {
  if (ticket.fixtureStatus !== "matched")
    return "场未对上";
  if (ticket.market.status !== "matched")
    return "盘未对上";
  if (!ticket.market.ob)
    return "无 OB 盘";
  if (!String(ticket.market.oid || "").trim())
    return "无 oid";
  if (ticket.market.locked)
    return "锁盘";
  if (ticket.quote.status !== "ok")
    return "OB 价不够";
  if (!(Number(ticket.stake) > 0))
    return "注码未设";
  if (!String(ticket.obMid || "").trim())
    return "无 OB mid";
  return null;
}

export function pickPodFollowAutoTicket(
  tickets: PodFollowPlaceTicket[],
  placedIds: Iterable<string>,
): PodFollowPlaceTicket | null {
  const done = new Set(placedIds);
  for (const ticket of tickets) {
    if (done.has(ticket.id))
      continue;
    if (podFollowPlaceBlock(ticket) == null)
      return ticket;
  }
  return null;
}

export async function placePodFollowBet(ticket: PodFollowPlaceTicket): Promise<{ ok: boolean; message: string }> {
  const block = podFollowPlaceBlock(ticket);
  if (block)
    return { ok: false, message: block };
  const placed = await placeObSportSingle({
    oid: String(ticket.market.oid || "").trim(),
    mid: String(ticket.obMid || "").trim(),
    odds: Number(ticket.quote.quote) || Number(ticket.market.quote) || 0,
    stake: Number(ticket.stake),
    minOdds: Number(ticket.quote.minObOdds) || 0,
  });
  if (!placed.ok)
    return { ok: false, message: placed.message };
  return { ok: true, message: placed.orderId ? `已下 ${placed.orderId}` : "已下单" };
}
