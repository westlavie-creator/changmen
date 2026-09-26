/**
 * 熊猫体育注单 HTTP。对齐电竞「按账号轮询未结/已结」，不写电竞 orders。
 *
 * [官网可证实] PC bundle `match-list-tpl` / `use-id`（BUILD 2026-09-01）：
 * - `API_PREFIX_YEWU_RECORD=yewurecord`
 * - `post_getOrderList` → POST `/order/betRecord/getOrderListPB`
 * - `query_order_status` → GET `/yewu13/v1/betOrder/queryOrderStatus`
 * - 注单页 tab：`weijiesuan=0` / `yijiesuan=1` / `yuyuezhudan=2` → 请求体 `orderStatus`+`selected`
 * - 默认 `timeType:1`、`orderBy:1`；有 begin/end 时删 timeType
 * - 回包 `data.records[]` + `detailList[]`：`homeName`/`awayName`、`oddFinally`、`betAmount`、
 *   `playName`/`playOptionName`/`marketValue`、`outcome`/`profitAmount`
 * - 订单展示对齐电竞 getOrders：下单后 wait 注单出现再落库；队名等以官网为准
 *
 * 必须用下单账号的 sportOb 拉单；禁止电竞 orderList 接口。
 */
import {
  isObSportMemberId,
  pickObSportBetAccount,
  sportObSessionFromAccount,
  type ObSportBetAccountLike,
} from "@/runtime/obSportBetAccount";
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

const WAIT_FOR_ORDER_ATTEMPTS = 6;
const WAIT_FOR_ORDER_GAP_MS = 800;
const ORDER_LIST_PAGE_SIZE = 100;
const ORDER_LIST_MAX_PAGES = 3;
const ACCOUNT_ORDER_LOOKBACK_DAYS = 1;

type ObSportOrderListWindow = {
  beginTime: string;
  endTime: string;
};

/** [官网可证实] 未结 orderStatus=0；已结 orderStatus=1（注单页 weijiesuan/yijiesuan）。 */
export function buildObSportOrderListBodies(
  userId: string,
  window?: ObSportOrderListWindow | null,
): Record<string, unknown>[] {
  const uid = String(userId || "").trim();
  const base = {
    page: 1,
    size: ORDER_LIST_PAGE_SIZE,
    orderBy: 1,
    ...(window?.beginTime && window?.endTime
      ? { beginTime: window.beginTime, endTime: window.endTime }
      : { timeType: 1 }),
    ...(uid ? { userId: uid } : {}),
  };
  return [
    { ...base, orderStatus: 0, selected: 0, outright: null },
    { ...base, orderStatus: 1, selected: 1 },
  ];
}

export type ObSportPendingOrderRef = {
  orderId: string;
  playerId?: number;
  at?: number;
};

function enrichSession(session: SportObSessionLocal | null): SportObSessionLocal | null {
  if (!session?.token)
    return null;
  const collect = readLocalSportObSession();
  const sameCollectToken = Boolean(
    collect?.token && String(collect.token).trim() === String(session.token).trim(),
  );
  if (!session.gateway && sameCollectToken)
    session.gateway = String(collect?.gateway || collect?.lastGateway || "").trim();
  if (!isObSportMemberId(session.sessionId) && sameCollectToken)
    session.sessionId = String(collect?.sessionId || collect?.uid || "").trim();
  if (!session.gateway || !isObSportMemberId(session.sessionId))
    return null;
  return session;
}

function resolveDefaultRecordSession(): SportObSessionLocal | null {
  const settings = readPodBetSettings();
  const account = pickObSportBetAccount(
    useAccountStore().accounts,
    settings.followAccountIds[0] || settings.followAccountId,
  );
  return enrichSession(sportObSessionFromAccount(account));
}

function resolveSessionForAccountId(accountId: number): SportObSessionLocal | null {
  const pid = Math.round(Number(accountId) || 0);
  if (pid > 0) {
    const hit = useAccountStore().accounts.find(row => Number(row.accountId) === pid) as
      | ObSportBetAccountLike
      | undefined;
    const session = enrichSession(sportObSessionFromAccount(hit));
    if (session)
      return session;
  }
  return resolveDefaultRecordSession();
}

/** 账号级拉单必须严格使用该账号会话，禁止凭证缺失时串到默认账号。 */
function resolveExactSessionForAccountId(accountId: number): SportObSessionLocal | null {
  const pid = Math.round(Number(accountId) || 0);
  if (pid <= 0)
    return null;
  const hit = useAccountStore().accounts.find(row => Number(row.accountId) === pid) as
    | ObSportBetAccountLike
    | undefined;
  return enrichSession(sportObSessionFromAccount(hit));
}

function isPendingStatus(status: ObSportOrderStatusPatch["status"]): boolean {
  return status === "None" || status === "Pending";
}

function mergePatches(parts: ObSportOrderStatusPatch[][]): ObSportOrderStatusPatch[] {
  const map = new Map<string, ObSportOrderStatusPatch>();
  for (const part of parts) {
    for (const patch of part) {
      if (!patch.orderId)
        continue;
      const prev = map.get(patch.orderId);
      if (!prev) {
        map.set(patch.orderId, patch);
        continue;
      }
      const preferNextStatus = !isPendingStatus(patch.status) || isPendingStatus(prev.status);
      map.set(patch.orderId, {
        ...prev,
        ...Object.fromEntries(
          Object.entries(patch).filter(([, v]) => v != null && v !== ""),
        ),
        status: preferNextStatus ? patch.status : prev.status,
        profit: preferNextStatus ? patch.profit : prev.profit,
        odds: (patch.odds && patch.odds > 1 ? patch.odds : 0) || prev.odds,
        stake: (patch.stake && patch.stake > 0 ? patch.stake : 0) || prev.stake,
        home: patch.home || prev.home,
        away: patch.away || prev.away,
        sideLabel: patch.sideLabel || prev.sideLabel,
        marketLabel: patch.marketLabel || prev.marketLabel,
        oid: patch.oid || prev.oid,
        obMid: patch.obMid || prev.obMid,
        at: patch.at || prev.at,
      });
    }
  }
  return [...map.values()];
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatLocalDateTime(ms: number, endOfDay = false): string {
  const d = new Date(ms);
  const h = endOfDay ? 23 : 0;
  const m = endOfDay ? 59 : 0;
  const s = endOfDay ? 59 : 0;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

/**
 * 对齐电竞 getOrders：一次账号刷新按账号拉整段订单列表，而不是逐单逐日请求。
 * 起点取该账号最老待结单所在日，终点取今天；无有效时间时沿用场馆 timeType=1。
 */
export function accountOrderListWindow(
  refs: ObSportPendingOrderRef[],
  now = Date.now(),
): ObSportOrderListWindow | null {
  const times = refs
    .map(row => Number(row.at) || 0)
    .filter(ms => Number.isFinite(ms) && ms > 0);
  if (!times.length)
    return null;
  return {
    beginTime: formatLocalDateTime(Math.min(...times)),
    endTime: formatLocalDateTime(now, true),
  };
}

/** 对齐电竞 OB：账号刷新拉昨天 00:00:00 到今天 23:59:59。 */
export function recentAccountOrderListWindow(
  now = Date.now(),
  lookbackDays = ACCOUNT_ORDER_LOOKBACK_DAYS,
): ObSportOrderListWindow {
  const start = new Date(now);
  start.setDate(start.getDate() - Math.max(0, Math.floor(lookbackDays)));
  return {
    beginTime: formatLocalDateTime(start.getTime()),
    endTime: formatLocalDateTime(now, true),
  };
}

async function fetchListPatches(
  session: SportObSessionLocal,
  ids: string[],
  window: ObSportOrderListWindow | null = null,
): Promise<ObSportOrderStatusPatch[]> {
  const parts: ObSportOrderStatusPatch[][] = [];
  const want = new Set(ids);
  const userId = String(session.sessionId || session.uid || "").trim();
  // 未结 + 已结都拉：未结通常无 outcome；已结才有输赢。不因未结命中提前 break。
  for (const body of buildObSportOrderListBodies(userId, window)) {
    for (let page = 1; page <= ORDER_LIST_MAX_PAGES; page++) {
      try {
        const listed = await postObSportPb(OB_SPORT_GET_ORDER_LIST_PATH, { ...body, page }, session);
        const records = parseObSportBetRecordList(listed);
        parts.push(want.size ? records.filter(row => want.has(row.orderId)) : records);
        if (want.size && ids.every(id => mergePatches(parts).some(row => row.orderId === id)))
          break;
        if (records.length < ORDER_LIST_PAGE_SIZE)
          break;
      }
      catch (err) {
        if (import.meta.env?.DEV)
          console.warn("[football] yewurecord getOrderListPB skipped", body.orderStatus, err);
        break;
      }
    }
  }
  return mergePatches(parts);
}

async function fetchPatchesWithSession(
  session: SportObSessionLocal,
  refs: ObSportPendingOrderRef[],
): Promise<ObSportOrderStatusPatch[]> {
  const ids = [...new Set(refs.map(row => String(row.orderId || "").trim()).filter(Boolean))];
  const want = new Set(ids);
  // 已结盈亏以注单列表为准；queryOrderStatus 只补还没出现在列表里的拒单。
  // 主链路与电竞一致：账号级一次拉未结 + 已结列表，再按 orderId 覆盖本地待结订单。
  const accountRows = await fetchListPatches(session, [], accountOrderListWindow(refs));
  const fromList = accountRows.filter(row => want.has(row.orderId));
  const have = new Set(fromList.map(row => row.orderId));
  const missingIds = ids.filter(id => !have.has(id));
  if (!missingIds.length)
    return fromList;
  try {
    const queried = await getObSportPb(
      OB_SPORT_QUERY_ORDER_STATUS_PATH,
      { orderNos: missingIds.join(",") },
      session,
    );
    const fromQuery = parseObSportQueryOrderStatus(queried).filter(row => !have.has(row.orderId));
    return mergePatches([fromList, fromQuery]);
  }
  catch (err) {
    if (import.meta.env?.DEV)
      console.warn("[football] queryOrderStatus skipped", err);
    return fromList;
  }
}

/** 单会话：兼容旧调用。优先走带 playerId 的分组入口。 */
export async function fetchObSportOrderStatusPatches(orderIds: string[]): Promise<ObSportOrderStatusPatch[]> {
  const ids = [...new Set(orderIds.map(id => String(id || "").trim()).filter(Boolean))];
  const session = resolveDefaultRecordSession();
  if (!session)
    return [];
  return fetchPatchesWithSession(session, ids.map(orderId => ({ orderId })));
}

/**
 * 对齐电竞 provider.getOrders：按一个体育账号批量拉近期未结 + 已结订单。
 * 返回场馆完整列表，调用方负责 upsert；不依赖本地已经存在 orderId。
 */
export async function fetchObSportAccountOrderPatches(
  playerId: number,
): Promise<ObSportOrderStatusPatch[]> {
  const session = resolveExactSessionForAccountId(playerId);
  if (!session)
    return [];
  return fetchListPatches(session, [], recentAccountOrderListWindow());
}

/**
 * 对齐电竞 syncVenueOrders(waitForOrderId)：下单后轮询注单直到出现该 orderNo。
 * 返回官网回填补丁（队名/赔率/金额），没有则 []。
 */
export async function waitObSportVenueOrderHydration(opts: {
  orderId: string;
  playerId?: number;
  attempts?: number;
  gapMs?: number;
}): Promise<ObSportOrderStatusPatch[]> {
  const orderId = String(opts.orderId || "").trim();
  if (!orderId)
    return [];
  const attempts = Math.max(1, Number(opts.attempts) || WAIT_FOR_ORDER_ATTEMPTS);
  const gapMs = Math.max(0, Number(opts.gapMs) || WAIT_FOR_ORDER_GAP_MS);
  const playerId = Math.round(Number(opts.playerId) || 0);
  const session = resolveSessionForAccountId(playerId);
  if (!session)
    return [];

  for (let i = 1; i <= attempts; i++) {
    const patches = await fetchListPatches(session, [orderId]);
    const hit = patches.find(row => row.orderId === orderId);
    if (hit && (hit.home || hit.away || (hit.odds && hit.odds > 1) || (hit.stake && hit.stake > 0)))
      return [hit];
    if (i < attempts)
      await new Promise(resolve => setTimeout(resolve, gapMs));
  }
  return fetchListPatches(session, [orderId]);
}

/**
 * 对齐电竞 updateOrders：按下单账号各自拉注单。
 * playerId=0 的落到跟单默认号 / 第一个有 sportOb 的账号。
 */
export async function fetchObSportPendingOrderPatches(
  pending: ObSportPendingOrderRef[],
): Promise<ObSportOrderStatusPatch[]> {
  const byAccount = new Map<number, ObSportPendingOrderRef[]>();
  for (const row of pending) {
    const orderId = String(row.orderId || "").trim();
    if (!orderId)
      continue;
    const pid = Math.round(Number(row.playerId) || 0);
    const list = byAccount.get(pid) ?? [];
    if (!list.some(item => item.orderId === orderId))
      list.push({ orderId, playerId: pid, at: Number(row.at) || 0 });
    byAccount.set(pid, list);
  }
  if (!byAccount.size)
    return [];

  const parts: ObSportOrderStatusPatch[][] = [];
  for (const [playerId, refs] of byAccount) {
    const session = resolveSessionForAccountId(playerId);
    if (!session) {
      if (import.meta.env?.DEV)
        console.warn("[football] settle skipped: no sportOb session", playerId || "default");
      continue;
    }
    parts.push(await fetchPatchesWithSession(session, refs));
  }
  return mergePatches(parts);
}
