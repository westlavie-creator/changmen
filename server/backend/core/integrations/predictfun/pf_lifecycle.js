/**
 * PredictFun 中转：用户可见生命周期（刻意保持简单）
 *
 * 产品模型：用户 ↔ changmen 账本 ↔ PF 官网（house 执行器）
 * 用户只认 changmen 处理后的结果；官网过程态不外泄。
 *
 * ── 用户可见（API / 工作台）────────────────────────────────
 *   status:    pending | none | win | lose | reject
 *   pfSellState: open | closed | settled
 *
 *   pending  = 已扣款、持仓未就绪（等成交/fee）
 *   open     = 可卖 / 可等到期结算（有 pfHoldShares）
 *   closed   = 已卖出
 *   settled  = 市场到期结算
 *   reject   = 未成交，应退款
 *
 * ── 内部恢复标记（raw 可存，不进用户 DTO）────────────────
 *   closing         = 卖出已在官网成交，fee/落库未完成（对外仍算 open，可重试卖出）
 *   pending_credit  = 终态已写，入账未完成（对外已是 closed/settled/reject）
 *
 * 禁止再把官网 FILLED / fee 迟到等过程态暴露成用户状态。
 */

/** @typedef {"open"|"closed"|"settled"} UserPfSellState */
/** @typedef {"open"|"closing"|"closed"|"settled"|""} InternalPfSellState */
/** @typedef {"pending_credit"|"credited"|""} PfLedgerState */

/**
 * @param {unknown} raw
 * @returns {InternalPfSellState}
 */
export function readInternalPfSellState(raw) {
  const s = String(
    raw?.pfSellState ?? raw?.PfSellState ?? "",
  ).trim().toLowerCase();
  if (s === "open" || s === "closing" || s === "closed" || s === "settled")
    return s;
  return "";
}

/**
 * @param {unknown} raw
 * @returns {PfLedgerState}
 */
export function readPfLedgerState(raw) {
  const s = String(raw?.pfLedgerState ?? raw?.PfLedgerState ?? "").trim().toLowerCase();
  if (s === "pending_credit" || s === "credited")
    return s;
  return "";
}

/**
 * @param {unknown} raw
 * @returns {number}
 */
export function readPfPendingCreditUsdt(raw) {
  const n = Number(raw?.pfPendingCreditUsdt ?? raw?.PfPendingCreditUsdt);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
}

/**
 * 用户可见卖出阶段：closing → open（卖出未完成，仍可重试）
 * @param {unknown} raw
 * @returns {UserPfSellState|undefined}
 */
export function toUserPfSellState(raw) {
  const s = readInternalPfSellState(raw);
  if (s === "closing")
    return "open";
  if (s === "open" || s === "closed" || s === "settled")
    return s;
  return undefined;
}

/** 内部：禁止市场结算抢赔（含卖出进行中） */
export function isPfSellBlockedForSettle(raw) {
  const s = readInternalPfSellState(raw);
  return s === "closed" || s === "settled" || s === "closing";
}

/** 内部：卖出进行中，应走 resume 而非新开卖单 */
export function isPfSellClosing(raw) {
  return readInternalPfSellState(raw) === "closing";
}

/** 用户语义：是否已结束持仓（已卖或已结算） */
export function isPfPositionTerminalForUser(raw) {
  const s = toUserPfSellState(raw);
  return s === "closed" || s === "settled";
}

/**
 * 卖出前门控（纯判定，不 IO）。
 * @returns {{ ok: false, msg: string }
 *   | { ok: true, action: "resume_credit" }
 *   | { ok: true, action: "resume_closing", sellHash: string }
 *   | { ok: true, action: "sell", marketId: string, tokenId: string, holdShares: number }}
 */
export function evaluatePfBuyForSell(buy) {
  if (!buy)
    return { ok: false, msg: "找不到对应买单" };
  if (String(buy.pfSide ?? buy.PfSide ?? "").toLowerCase() === "sell")
    return { ok: false, msg: "不能对卖单再卖" };

  const sellState = readInternalPfSellState(buy);
  if (sellState === "closed") {
    if (readPfLedgerState(buy) === "pending_credit")
      return { ok: true, action: "resume_credit" };
    return { ok: false, msg: "该买单已卖出" };
  }
  if (sellState === "settled")
    return { ok: false, msg: "该买单已结算" };
  if (sellState === "closing") {
    const sellHash = String(buy.pfSellOrderId ?? "").trim();
    if (!sellHash)
      return { ok: false, msg: "卖出确认中（缺 sell hash），请联系客服" };
    return { ok: true, action: "resume_closing", sellHash };
  }

  const st = String(buy.status ?? buy.Status ?? "").toLowerCase();
  if (st === "reject" || st === "return" || st === "pending")
    return { ok: false, msg: "买单尚未确认成交或已拒单，不能卖出" };
  if (st === "win" || st === "lose")
    return { ok: false, msg: "买单已到期结算，不能卖出" };

  const marketId = String(buy.pfMarketId ?? buy.Match ?? buy.match ?? "").trim();
  const tokenId = String(buy.pfTokenId ?? buy.Item ?? buy.item ?? "").trim();
  if (!marketId || !tokenId)
    return { ok: false, msg: "买单缺少 marketId/tokenId" };

  const holdShares = Number(buy.pfHoldShares);
  if (!(Number.isFinite(holdShares) && holdShares > 0))
    return { ok: false, msg: "持仓未就绪，请稍后重试 GetOrder 后再卖" };

  return { ok: true, action: "sell", marketId, tokenId, holdShares };
}
