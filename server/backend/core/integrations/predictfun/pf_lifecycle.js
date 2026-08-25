/**
 * PredictFun 订单生命周期（用户可见状态 + 内部恢复标记）
 *
 * 用户自签（pfUserSigned）：余额真源在官网链上，禁止 total_balance 扣款/退款/结算入账。
 * 历史 house 中转单：仍可能走 pending_credit → total_balance（清退前兼容）。
 *
 * ── 用户可见（API / 工作台）────────────────────────────────
 *   status:    pending | none | win | lose | reject
 *   pfSellState: open | closed | settled
 *
 * ── 内部恢复标记（raw 可存，不进用户 DTO）────────────────
 *   closing         = 卖出已在官网成交，fee/落库未完成
 *   pending_credit  = 终态已写，入账未完成（仅非 userSigned）
 */

/** @typedef {"open"|"closed"|"settled"} UserPfSellState */
/** @typedef {"open"|"closing"|"closed"|"settled"|""} InternalPfSellState */
/** @typedef {"pending_credit"|"credited"|""} PfLedgerState */

/** 浏览器自签单：不碰中转账本 */
export function isPfUserSignedOrder(raw) {
  return raw?.pfUserSigned === true || raw?.PfUserSigned === true;
}

/** sync / upsert 时带回自签标记，避免 OrderData 映射冲掉 raw */
export function pfUserSignedSavePatch(rdsRow) {
  if (isPfUserSignedOrder(rdsRow))
    return { pfUserSigned: true };
  return {};
}

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
