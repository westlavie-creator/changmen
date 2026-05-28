import { post, unwrap } from "@/api/client";
import type { UserProfitRow } from "@/types/esport";
import { stringToHashNumber } from "@/shared/hashNumber";

export async function monthReport(month?: string) {
  return unwrap(await post<unknown>("Client_MonthReport", { month }));
}

export async function getUserProfit() {
  return unwrap(await post<UserProfitRow[]>("Client_GetUserProfit"));
}

/** 对齐 console `Vt.getRankList`：Client_GetUserProfit + phblist 合并 */
export async function getRankList(): Promise<UserProfitRow[]> {
  const rows = await getUserProfit();
  try {
    const res = await fetch(`/esport-ahao/api/Auth/phblist?v=${Date.now()}`);
    if (!res.ok) return rows;
    const data = (await res.json()) as {
      users?: { UserID: string; TotalMoney: number }[];
    };
    if (!data.users?.length) return rows;
    const today = new Date().toISOString().slice(0, 10);
    for (const u of data.users) {
      rows.push({
        UserID: stringToHashNumber(u.UserID),
        UserName: u.UserID,
        Money: u.TotalMoney,
        Date: today,
      });
    }
  } catch (e) {
    console.error(e);
  }
  return rows;
}

export async function getDefaultOdds(body: Record<string, unknown>) {
  return unwrap(await post<{ odds: number }>("Client_GetDefaultOdds", body));
}

export async function getMatchDefaultOdds(body: Record<string, unknown>) {
  return unwrap(await post<Record<string, unknown>>("Client_GetMatchDefaultOdds", body));
}
