import type { ValueBetDashboard } from "@/types/valueBet";
import { post, unwrap } from "@/api/client";

export async function getValueBetDashboard() {
  return unwrap(await post<ValueBetDashboard>("Client_AdminValueBet", {}));
}
