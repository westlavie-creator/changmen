import type { ClientMatchDto } from "@/types/esport";

function settledRows(result: PromiseSettledResult<ClientMatchDto[]>): ClientMatchDto[] {
  return result.status === "fulfilled" && Array.isArray(result.value) ? result.value : [];
}

/** 场馆列表只并列，不合场、不 overlay；POD 插件分别完成身份与盘口匹配。 */
export async function collectIndependentFootballVenueRows(
  pmPromise: Promise<ClientMatchDto[]>,
  obPromise: Promise<ClientMatchDto[]>,
): Promise<ClientMatchDto[]> {
  const [pm, ob] = await Promise.allSettled([pmPromise, obPromise]);
  const rows = [...settledRows(pm), ...settledRows(ob)];
  rows.sort((a, b) => (
    (Number(a.StartTime) || 0) - (Number(b.StartTime) || 0)
    || (Number(a.ID) || 0) - (Number(b.ID) || 0)
  ));
  if (rows.length)
    return rows;
  const reason = pm.status === "rejected" ? pm.reason : ob.status === "rejected" ? ob.reason : null;
  if (reason)
    throw reason instanceof Error ? reason : new Error(String(reason));
  return [];
}
