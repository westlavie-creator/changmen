/**
 * 足球订单 HTTP。不走电竞 SaveOrder / GetOrderList / AdminOrders。
 */
import { post, unwrap } from "@/api/client";
import type { PodSportOrder } from "@/runtime/podSportOrders";

export type FootballOrderDto = PodSportOrder & {
  rdsId?: number;
  venue?: string;
  playerId?: number;
  accountName?: string;
  userId?: string;
  userName?: string;
};

export async function saveFootballOrder(order: FootballOrderDto): Promise<FootballOrderDto> {
  return unwrap(await post<FootballOrderDto>("Client_SaveFootballOrder", {
    clientId: order.id,
    venueOrderId: order.orderId,
    at: order.at,
    home: order.home,
    away: order.away,
    sideLabel: order.sideLabel,
    marketLabel: order.marketLabel,
    odds: order.odds,
    stake: order.stake,
    oid: order.oid,
    obMid: order.obMid,
    auto: order.auto ? 1 : 0,
    venue: order.venue || "OB",
    playerId: order.playerId || 0,
    accountName: order.accountName || "",
    status: order.status || "None",
    profit: Number(order.profit) || 0,
  }));
}

export async function patchFootballOrderStatus(body: {
  orderId: string;
  status: string;
  profit?: number;
  venue?: string;
}): Promise<FootballOrderDto> {
  return unwrap(await post<FootballOrderDto>("Client_SaveFootballOrder", {
    venueOrderId: body.orderId,
    venue: body.venue || "OB",
    status: body.status,
    profit: Number(body.profit) || 0,
  }));
}

export async function getFootballOrders(body: { date?: string } = {}): Promise<FootballOrderDto[]> {
  const info = await unwrap(await post<{ list?: FootballOrderDto[] }>("Client_GetFootballOrders", {
    date: body.date || "",
  }));
  return Array.isArray(info?.list) ? info.list : [];
}

export type AdminFootballOrderPage = {
  date: string;
  list: FootballOrderDto[];
  total: number;
  todayStake: number;
  todayProfit: number;
};

export async function getAdminFootballOrders(body: {
  date?: string;
  userId?: string;
} = {}): Promise<AdminFootballOrderPage> {
  return unwrap(await post<AdminFootballOrderPage>("Client_AdminFootballOrders", {
    date: body.date || "",
    userId: body.userId || "",
  }));
}
