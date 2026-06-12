import { post, unwrap } from "@/api/client";
import type { ChatMessageRow, UserListRow } from "@/types/esport";
import type { OrderRow } from "@/types/order";
import type { MoneyRiskLog } from "@/shared/moneyRisk";

export interface PlayerOrdersInfo {
  logs: MoneyRiskLog[];
  orders: OrderRow[];
}

export async function getPlayerOrder(body: Record<string, unknown>) {
  return unwrap(await post<PlayerOrdersInfo>("Client_GetPlayerOrder", body));
}

export async function getUsers() {
  return unwrap(await post<UserListRow[]>("Client_GetUsers"));
}

export async function getChatHistory(body: Record<string, unknown> = {}) {
  return unwrap(await post<ChatMessageRow[]>("Client_GetChatHistory", body));
}

export async function saveUserLog(body: Record<string, unknown>) {
  return unwrap(await post<boolean>("Client_SaveUserLog", body));
}

export async function sendMessage(body: Record<string, unknown>) {
  return unwrap(await post<boolean>("SendMessage", body));
}
