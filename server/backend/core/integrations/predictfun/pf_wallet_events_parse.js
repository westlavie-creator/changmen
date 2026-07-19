/**
 * 解析 predictWalletEvents 推送 → 订单结算提示
 * @see https://dev.predict.fun/subscription-topics-1915507m0
 */

/** @typedef {"filled"|"unfilled"|"pending"} PfWalletSettlement */

/**
 * @param {unknown} raw 整帧 JSON 或 data 对象
 * @returns {{ orderHash: string, orderId: string, type: string, settlement: PfWalletSettlement, executedSizeWei?: string, executedValueWei?: string, executedPriceWei?: string }|null}
 */
export function parsePredictWalletEvent(raw) {
  let msg = raw;
  if (typeof raw === "string") {
    try {
      msg = JSON.parse(raw);
    }
    catch {
      return null;
    }
  }
  if (!msg || typeof msg !== "object")
    return null;

  /** @type {Record<string, unknown>} */
  let ev = msg;
  if (String(ev.type) === "M" && ev.data && typeof ev.data === "object")
    ev = /** @type {Record<string, unknown>} */ (ev.data);

  const type = String(ev.type ?? "").trim();
  if (!type)
    return null;

  const orderHash = String(ev.orderHash ?? "").trim();
  const orderId = String(ev.orderId ?? "").trim();
  if (!orderHash && !orderId)
    return null;

  const details = ev.details && typeof ev.details === "object"
    ? /** @type {Record<string, unknown>} */ (ev.details)
    : {};
  // 官方字段名 `fill`（另兼容误写 fills / 嵌 details）
  const fillRaw = ev["fill"]
    ?? ev["fills"]
    ?? details["fill"]
    ?? details["fills"]
    ?? null;
  const fillObj = fillRaw && typeof fillRaw === "object"
    ? /** @type {Record<string, unknown>} */ (fillRaw)
    : {};

  /** @type {PfWalletSettlement} */
  let settlement = "pending";
  if (
    type === "orderNotAccepted"
    || type === "orderExpired"
    || type === "orderCancelled"
    || type === "orderTransactionFailed"
  ) {
    settlement = "unfilled";
  }
  else if (type === "orderTransactionSuccess") {
    settlement = "filled";
  }
  else if (
    type === "orderAccepted"
    || type === "orderTransactionSubmitted"
  ) {
    settlement = "pending";
  }
  else {
    return null;
  }

  return {
    orderHash,
    orderId,
    type,
    settlement,
    executedSizeWei: fillObj.executedSizeWei != null ? String(fillObj.executedSizeWei) : undefined,
    executedValueWei: fillObj.executedValueWei != null ? String(fillObj.executedValueWei) : undefined,
    executedPriceWei: fillObj.executedPriceWei != null ? String(fillObj.executedPriceWei) : undefined,
  };
}

/**
 * Wallet 终态提示 → 最小 OrderData（REST 滞后时的 fallback）
 * @param {{ orderHash: string, orderId?: string, type?: string, settlement: PfWalletSettlement, executedSizeWei?: string, executedValueWei?: string }} hint
 */
export function officialStubFromWalletHint(hint) {
  if (!hint || hint.settlement === "pending")
    return null;
  const hash = String(hint.orderHash ?? "").trim();
  if (hint.settlement === "filled") {
    return {
      status: "FILLED",
      id: hint.orderId || undefined,
      amountFilled: hint.executedSizeWei,
      order: {
        hash,
        makerAmount: hint.executedSizeWei,
        takerAmount: hint.executedValueWei,
      },
      pfWalletEvent: hint.type,
    };
  }
  return {
    status: "CANCELLED",
    id: hint.orderId || undefined,
    order: { hash },
    pfWalletEvent: hint.type,
  };
}
