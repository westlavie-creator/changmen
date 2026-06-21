import type { MoneyRiskLog } from "@/shared/moneyRisk";
import type { ChatMessageRow, UserListRow } from "@/types/esport";
import type { OrderRow } from "@/types/order";
import { post, unwrap } from "@/api/client";

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

/** [A8 可证实] Vt.saveLog(title, data) → Client_SaveUserLog */
export async function saveUserLog(title: string, data?: unknown) {
  const payload = {
    title: String(title),
    data: typeof data === "string" ? data : JSON.stringify(data ?? ""),
  };
  return unwrap(await post<boolean>("Client_SaveUserLog", payload));
}

export async function sendMessage(body: Record<string, unknown>) {
  return unwrap(await post<boolean>("SendMessage", body));
}
