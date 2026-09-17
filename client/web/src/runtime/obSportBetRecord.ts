/**
 * 熊猫体育注单 HTTP。对齐电竞 getOrders 轮询，不写电竞 orders。
 *
 * [官网可证实] BUILDIN_CONFIG `API_PREFIX_YEWU_RECORD=yewurecord`；
 * `query_order_status` GET `/yewu13/v1/betOrder/queryOrderStatus?orderNos=`（code=200）；
 * `post_getOrderList` POST `/yewurecord/order/betRecord/getOrderListPB`。
 * 列表 POST 体未抓到调用点，键沿用同包 `together_hall_record.params` 的 page/size/sportId/timeType。
 */
import { pickObSportBetAccount, sportObSessionFromAccount } from "@/runtime/obSportBetAccount";
import { getObSportPb, postObSportPb } from "@/runtime/obSportFootballFetch";
import {
  parseObSportBetRecordList,
  parseObSportQueryOrderStatus,
  type ObSportOrderStatusPatch,
} from "@/runtime/obSportOrderStatus";
import { readLocalSportObSession, type SportObSessionLocal } from "@/runtime/obSportSessionLocal";
import { readPodBetSettings } from "@/runtime/podBetSettings";
import { useAccountStore } from "@/stores/accountStore";

export const OB_SPORT_QUERY_ORDER_STATUS_PATH = "/yewu13/v1/betOrder/queryOrderStatus";
export const OB_SPORT_GET_ORDER_LIST_PATH = "/yewurecord/order/betRecord/getOrderListPB";

function resolveObSportRecordSession(): SportObSessionLocal | null {
  const settings = readPodBetSettings();
  const account = pickObSportBetAccount(
    useAccountStore().accounts,
    settings.followAccountIds[0] || settings.followAccountId,
  );
  const session = sportObSessionFromAccount(account);
  if (!session?.token)
    return null;
  const collect = readLocalSportObSession();
  if (!session.gateway)
    session.gateway = String(collect?.gateway || collect?.lastGateway || "").trim();
  if (!session.sessionId)
    session.sessionId = String(collect?.sessionId || collect?.uid || "").trim();
  if (!session.gateway)
    return null;
  return session;
}

function mergePatches(parts: ObSportOrderStatusPatch[][]): ObSportOrderStatusPatch[] {
  const seen = new Set<string>();
  const out: ObSportOrderStatusPatch[] = [];
  for (const part of parts) {
    for (const patch of part) {
      if (!patch.orderId || seen.has(patch.orderId))
        continue;
      seen.add(patch.orderId);
      out.push(patch);
    }
  }
  return out;
}

export async function fetchObSportOrderStatusPatches(orderIds: string[]): Promise<ObSportOrderStatusPatch[]> {
  const ids = [...new Set(orderIds.map(id => String(id || "").trim()).filter(Boolean))];
  const session = resolveObSportRecordSession();
  if (!session)
    return [];
  const parts: ObSportOrderStatusPatch[][] = [];
  if (ids.length) {
    try {
      const queried = await getObSportPb(
        OB_SPORT_QUERY_ORDER_STATUS_PATH,
        { orderNos: ids.join(",") },
        session,
      );
      parts.push(parseObSportQueryOrderStatus(queried));
    }
    catch (err) {
      if (import.meta.env?.DEV)
        console.warn("[football] queryOrderStatus skipped", err);
    }
  }
  try {
    const listed = await postObSportPb(
      OB_SPORT_GET_ORDER_LIST_PATH,
      { page: 1, size: 50, sportId: 1, timeType: 1 },
      session,
    );
    const records = parseObSportBetRecordList(listed);
    parts.push(ids.length ? records.filter(row => ids.includes(row.orderId)) : records);
  }
  catch (err) {
    if (import.meta.env?.DEV)
      console.warn("[football] yewurecord getOrderListPB skipped", err);
  }
  return mergePatches(parts);
}
