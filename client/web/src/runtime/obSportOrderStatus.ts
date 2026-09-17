/**
 * 熊猫体育订单状态。不走电竞 getOrders / Client_SaveOrder。
 *
 * [官网可证实] worker `R_CMD_ORDER_STATUS="C201"`；processBet 回包
 * `data.orderDetailRespList[].orderStatusCode===1` 表示受理成功（仍待结算）。
 * C201 `cd` 官方字段：`orderNo` / `status`（0/1 受理中，2/4 失败）。
 * [changmen 推测] 同包还可能带 outcome / profitAmount；仅在能解析出
 * Win/Lose/Reject/Return 时写库。queryOrderStatus 2/4 不要当成 outcome 2=赢。
 */
import type { FootballOrderStatus } from "@/runtime/podSportOrders";

/** 结算补丁；也可带官网注单展示字段（赔率/金额/比赛等）。 */
export type ObSportOrderStatusPatch = {
  orderId: string;
  status: FootballOrderStatus;
  profit: number;
  odds?: number;
  stake?: number;
  home?: string;
  away?: string;
  sideLabel?: string;
  marketLabel?: string;
  oid?: string;
  obMid?: string;
  at?: number;
};

function asRecord(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : null;
}

function str(v: unknown): string {
  return String(v ?? "").trim();
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function namedStatus(raw: unknown): FootballOrderStatus | null {
  const s = str(raw).toLowerCase();
  if (s === "win")
    return "Win";
  if (s === "lose")
    return "Lose";
  if (s === "reject" || s === "rejected" || s === "cancel" || s === "cancelled")
    return "Reject";
  if (s === "return" || s === "void" || s === "draw" || s === "refund")
    return "Return";
  if (s === "none" || s === "pending")
    return "None";
  return null;
}

/**
 * [官网可证实] PC `result_status_map`：
 * 2走水 3输 4赢 5赢半 6输半；7+ 取消/延迟/无效 → Return。
 * 禁止把 queryOrderStatus 的 status=2（拒单）当成 outcome。
 */
function outcomeStatus(raw: unknown): FootballOrderStatus | null {
  const named = namedStatus(raw);
  if (named)
    return named;
  const n = num(raw);
  if (n === 4 || n === 5)
    return "Win";
  if (n === 3 || n === 6)
    return "Lose";
  if (n === 2 || n === 7 || n === 8 || n === 11 || n === 12 || n === 13 || n === 15 || n === 16)
    return "Return";
  return null;
}

function orderIdOf(row: Record<string, unknown>): string {
  return str(row.orderNo || row.order_no || row.orderId || row.order_id);
}

function profitOf(row: Record<string, unknown>): number | null {
  return num(
    row.profitAmount
    ?? row.profit_amount
    ?? row.profit
    ?? row.netAmount
    ?? row.net_amount
    ?? row.backAmount
    ?? row.back_amount
    ?? row.winAmount
    ?? row.win_amount
    ?? row.settleAmount
    ?? row.settle_amount
    ?? row.profitLoss,
  );
}

/** 官网欧赔：优先 oddFinally / oddsValues（赔率变动后成交价）。 */
function oddsOf(row: Record<string, unknown>): number | null {
  const raw = row.oddFinally
    ?? row.oddsFinally
    ?? row.oddsValues
    ?? row.oddsValue
    ?? row.origin_finally
    ?? row.odds;
  const n = num(raw);
  if (n == null)
    return null;
  // ov 馆内整数（如 221000）→ 欧赔
  if (n >= 1000)
    return Math.round((n / 100000) * 1000) / 1000;
  return n > 1 ? n : null;
}

/** 注额：优先 betAmount；若像分（≥1000 的整数）则 /100。 */
function stakeOf(row: Record<string, unknown>): number | null {
  const raw = row.betAmount ?? row.orderAmount ?? row.seriesBetAmount ?? row.betMoney ?? row.stake;
  const n = num(raw);
  if (n == null || n <= 0)
    return null;
  if (Number.isInteger(n) && Math.abs(n) >= 1000 && Math.abs(n) % 100 === 0)
    return n / 100;
  return n;
}

function teamsOf(row: Record<string, unknown>): { home: string; away: string } {
  // [官网可证实] PC 注单卡：detailList[0].homeName + " VS " + awayName
  const home = str(row.homeName || row.home_name || row.mhn || row.home);
  const away = str(row.awayName || row.away_name || row.man || row.away);
  if (home && away && !isPlaceholderTeam(home) && !isPlaceholderTeam(away))
    return { home, away };
  const matchInfo = str(row.matchInfo || row.oriMatchInfo);
  const parts = matchInfo.split(/\s+(?:VS|vs|v)\s+/);
  if (parts.length >= 2) {
    const h = str(parts[0]);
    const a = str(parts.slice(1).join(" VS "));
    if (h && a && !isPlaceholderTeam(h) && !isPlaceholderTeam(a))
      return { home: h, away: a };
  }
  if (home && away)
    return { home, away };
  return { home: "", away: "" };
}

/** 本地盘面占位 / 联赛+mid，不是官网队名。 */
export function isPlaceholderTeam(name: string): boolean {
  const s = str(name);
  if (!s)
    return true;
  if (/^(主|客|主队|客队)$/.test(s))
    return true;
  if (/\s\d{4,12}$/.test(s))
    return true;
  if (/^\d{4,12}$/.test(s))
    return true;
  return false;
}

function marketLabelOf(row: Record<string, unknown>): string {
  const play = str(row.playName || row.play_name);
  const market = str(row.marketValue || row.market_value || row.hv);
  if (play && market)
    return `${play} ${market}`;
  if (play)
    return play;
  if (market)
    return market;
  return "";
}

function sideLabelOf(row: Record<string, unknown>): string {
  const raw = str(row.playOptionName || row.play_option_name || row.options_name || row.options);
  if (!raw)
    return "";
  // 「大 2.5」→ 侧边只留选项名
  const m = raw.match(/^(大|小|主|客|和|主胜|客胜|平)\b/);
  return m ? m[1] : raw;
}

function atOf(row: Record<string, unknown>): number | null {
  const raw = row.betTime ?? row.createTime ?? row.modifyTime ?? row.beginTime ?? row.orderTime;
  const n = num(raw);
  if (n == null || n <= 0)
    return null;
  return n < 1e12 ? n * 1000 : n;
}

function firstDetail(row: Record<string, unknown>): Record<string, unknown> {
  const list = row.detailList;
  if (!Array.isArray(list) || !list.length)
    return {};
  return asRecord(list[0]) || {};
}

/** 合并注单顶层 + detailList[0]。队名/玩法以 detail 为准（官网 PC 注单卡同结构）。 */
function mergedBetRecord(raw: unknown): Record<string, unknown> | null {
  const top = asRecord(raw);
  if (!top || !orderIdOf(top))
    return null;
  const detail = firstDetail(top);
  return {
    ...top,
    ...detail,
    orderNo: orderIdOf(top),
    outcome: top.outcome ?? detail.outcome,
    profitAmount: top.profitAmount ?? detail.profitAmount,
    backAmount: top.backAmount ?? detail.backAmount,
    betAmount: top.betAmount ?? detail.betAmount,
    // 成交赔率：detail.oddFinally / 顶层 odds（未结展示）
    oddFinally: detail.oddFinally ?? top.oddFinally ?? top.oddsValues ?? top.odds,
  };
}

function patchFromRow(raw: unknown): ObSportOrderStatusPatch | null {
  const row = asRecord(raw);
  if (!row)
    return null;
  const orderId = orderIdOf(row);
  if (!orderId)
    return null;

  const named = namedStatus(row.status)
    || namedStatus(row.orderStatus)
    || namedStatus(row.betStatus)
    || outcomeStatus(
      row.outcome
      ?? row.betResult
      ?? row.win
      ?? row.winStatus
      ?? row.result
      ?? row.settleResult,
    );
  if (!named || named === "None")
    return null;

  const profitRaw = profitOf(row);
  let profit = profitRaw ?? 0;
  if (named === "Reject")
    profit = 0;
  return { orderId, status: named, profit };
}

/**
 * [官网可证实] query_order_status / C201 `status`：0/1 受理中，2/4 失败。
 * 不要把这个数字当成 outcome（2=赢）。
 */
export function patchFromObSportQueryStatus(raw: unknown): ObSportOrderStatusPatch | null {
  const row = asRecord(raw);
  if (!row)
    return null;
  const settled = patchFromRow(row);
  if (settled)
    return settled;
  const orderId = orderIdOf(row);
  if (!orderId)
    return null;
  const st = num(row.status);
  if (st === 2 || st === 4)
    return { orderId, status: "Reject", profit: 0 };
  return null;
}

function patchFromBetRecordRow(raw: unknown): ObSportOrderStatusPatch | null {
  const settled = patchFromRow(raw);
  if (settled)
    return settled;
  const row = asRecord(raw);
  if (!row)
    return null;
  const orderId = orderIdOf(row);
  if (!orderId)
    return null;
  const profit = profitOf(row);
  // 请求筛选用 orderStatus 0/1；回包以 outcome / profitAmount 为准。
  const settledFlag = row.settleTime != null
    || row.isSettled === 1
    || row.isSettled === true
    || str(row.orderStatus).toLowerCase() === "settled"
    || outcomeStatus(row.outcome ?? row.betResult ?? row.settleResult) != null;
  if (profit == null) {
    if (settledFlag)
      return { orderId, status: "Return", profit: 0 };
    return null;
  }
  if (profit > 0)
    return { orderId, status: "Win", profit };
  if (profit < 0)
    return { orderId, status: "Lose", profit };
  if (settledFlag)
    return { orderId, status: "Return", profit: 0 };
  return null;
}

/**
 * [官网可证实] 注单 records[] + detailList[] → 展示字段。
 * 未结也可能有 oddFinally / betAmount / matchInfo；结算状态可缺。
 */
export function hydrateFromObSportBetRecord(raw: unknown): ObSportOrderStatusPatch | null {
  const row = mergedBetRecord(raw);
  if (!row)
    return null;
  const orderId = orderIdOf(row);
  if (!orderId)
    return null;

  const settled = patchFromBetRecordRow(row);
  const teams = teamsOf(row);
  const odds = oddsOf(row);
  const stake = stakeOf(row);
  const marketLabel = marketLabelOf(row);
  const sideLabel = sideLabelOf(row);
  const oid = str(row.playOptionsId || row.oddsId || row.oid);
  const obMid = str(row.matchInfoId || row.mid || row.matchId);
  const at = atOf(row);

  const status = settled?.status || "None";
  const profit = settled?.profit ?? 0;
  // 未结也要回写展示字段；没有可展示信息且未结算则跳过
  if (!settled && !(odds || stake || teams.home || teams.away || marketLabel || sideLabel))
    return null;

  return {
    orderId,
    status,
    profit,
    ...(odds ? { odds } : {}),
    ...(stake ? { stake } : {}),
    ...(teams.home ? { home: teams.home } : {}),
    ...(teams.away ? { away: teams.away } : {}),
    ...(sideLabel ? { sideLabel } : {}),
    ...(marketLabel ? { marketLabel } : {}),
    ...(oid ? { oid } : {}),
    ...(obMid ? { obMid } : {}),
    ...(at ? { at } : {}),
  };
}

function collectRows(raw: unknown, out: unknown[], depth: number) {
  if (depth > 6 || raw == null)
    return;
  if (Array.isArray(raw)) {
    for (const item of raw)
      collectRows(item, out, depth + 1);
    return;
  }
  const row = asRecord(raw);
  if (!row)
    return;
  if (str(row.orderNo || row.order_no || row.orderId || row.order_id))
    out.push(row);
  for (const key of ["cd", "data", "list", "orders", "orderList", "orderDetailRespList", "seriesOrderRespList", "records"]) {
    if (row[key] != null)
      collectRows(row[key], out, depth + 1);
  }
}

const ORDER_CMDS = new Set(["C201", "C118"]);

function uniquePatches(items: unknown[], map: (raw: unknown) => ObSportOrderStatusPatch | null): ObSportOrderStatusPatch[] {
  const seen = new Set<string>();
  const out: ObSportOrderStatusPatch[] = [];
  for (const item of items) {
    const patch = map(item);
    if (!patch || seen.has(patch.orderId))
      continue;
    seen.add(patch.orderId);
    out.push(patch);
  }
  return out;
}

/** processBet / C201 共用。受理成功（code=1）不算结算。 */
export function parseObSportOrderStatusPush(msg: unknown): ObSportOrderStatusPatch[] {
  const root = asRecord(msg);
  const cmd = str(root?.cmd || root?.CMD).toUpperCase();
  if (cmd && !ORDER_CMDS.has(cmd) && cmd.startsWith("C") && cmd !== "C201")
    return [];
  const bag: unknown[] = [];
  collectRows(msg, bag, 0);
  return uniquePatches(bag, patchFromObSportQueryStatus);
}

/** [官网可证实] GET queryOrderStatus `data[]`：orderNo + status。 */
export function parseObSportQueryOrderStatus(decoded: unknown): ObSportOrderStatusPatch[] {
  const bag: unknown[] = [];
  collectRows(decoded, bag, 0);
  return uniquePatches(bag, patchFromObSportQueryStatus);
}

/** [官网可证实] yewurecord 注单列表：完整回填展示字段 + 能解析则写结算。 */
export function parseObSportBetRecordList(decoded: unknown): ObSportOrderStatusPatch[] {
  const bag: unknown[] = [];
  collectRows(decoded, bag, 0);
  return uniquePatches(bag, hydrateFromObSportBetRecord);
}

/** 仅结算（无展示字段）。C201 / queryOrderStatus 用。 */
export function parseObSportBetRecordSettlement(decoded: unknown): ObSportOrderStatusPatch[] {
  const bag: unknown[] = [];
  collectRows(decoded, bag, 0);
  return uniquePatches(bag, patchFromBetRecordRow);
}

/**
 * [官网可证实] betPB `orderDetailRespList[0].oddsValues`（赔率变动后成交价）。
 */
export function oddsFromObSportPlace(decoded: unknown): number | null {
  const row = asRecord(decoded) || {};
  const data = asRecord(row.data) || row;
  const details = Array.isArray(data.orderDetailRespList) ? asRecord(data.orderDetailRespList[0]) : null;
  if (!details)
    return null;
  return oddsOf(details);
}

/**
 * [官网可证实] `orderDetailRespList[0].orderNo`；兼容 orderNos。
 */
export function orderIdFromObSportPlace(decoded: unknown): string {
  const row = asRecord(decoded) || {};
  const data = asRecord(row.data) || row;
  const details = data.orderDetailRespList;
  if (Array.isArray(details) && details[0]) {
    const first = asRecord(details[0]);
    const id = str(first?.orderNo || first?.orderId);
    if (id)
      return id;
  }
  for (const key of ["orderNos", "orders", "orderList"]) {
    const list = data[key];
    if (Array.isArray(list) && list[0]) {
      const first = asRecord(list[0]);
      const id = str(first?.orderNo || first?.orderId || first?.id);
      if (id)
        return id;
    }
  }
  return str(data.orderNo || data.orderId || data.id);
}

/** [官网可证实] orderStatusCode===1 受理；其它有码则视为未确认。 */
export function obSportPlaceAccepted(decoded: unknown): { ok: true; orderId: string } | { ok: false; message: string } {
  const row = asRecord(decoded) || {};
  const data = asRecord(row.data) || row;
  const details = Array.isArray(data.orderDetailRespList) ? asRecord(data.orderDetailRespList[0]) : null;
  const orderId = orderIdFromObSportPlace(decoded);
  const code = num(details?.orderStatusCode ?? data.orderStatusCode);
  if (code != null && code !== 1) {
    const msg = str(details?.msg || details?.message || data.msg || data.message);
    return { ok: false, message: msg || `场馆未确认(${code})` };
  }
  if (!orderId)
    return { ok: false, message: "场馆未返回单号" };
  return { ok: true, orderId };
}
