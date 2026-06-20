import { post, unwrap } from "@/api/client";
import type { ValueBetDashboard } from "@/types/valueBet";

export async function getValueBetDashboard() {
  return unwrap(await post<ValueBetDashboard>("Client_AdminValueBet", {}));
}
