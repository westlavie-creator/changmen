/**
 * 解析 predictWalletEvents 推送 → 订单结算提示
 * @see https://dev.predict.fun/subscription-topics-1915507m0
 */

/** @typedef {"filled"|"unfilled"|"pending"} PfWalletSettlement */
/** @typedef {"COLLATERAL"|"SHARES"} PfWalletFeeType */

/**
 * @param {unknown} feeRaw
 * @returns {{ amountWei: string, type: PfWalletFeeType }|null}
 */
export function parsePredictWalletFee(feeRaw) {
  if (!feeRaw || typeof feeRaw !== "object")
    return null;
  const amountWei = String(/** @type {Record<string, unknown>} */ (feeRaw).amountWei ?? "").trim();
  if (!amountWei || !/^\d+$/.test(amountWei))
    return null;
  const typeRaw = String(/** @type {Record<string, unknown>} */ (feeRaw).type ?? "").trim().toUpperCase();
  const type = typeRaw === "SHARES" ? "SHARES" : "COLLATERAL";
  return { amountWei, type };
}

/**
 * @param {string|undefined} amountWei
 * @param {PfWalletFeeType|string|undefined} type
 * @returns {number|undefined} COLLATERAL → USDT；SHARES 不换算
 */
export function pfFeeAmountWeiToUsdt(amountWei, type) {
  if (String(type ?? "").toUpperCase() === "SHARES")
    return undefined;
  const s = String(amountWei ?? "").trim();
  if (!s || !/^\d+$/.test(s))
    return undefined;
  try {
    const n = Number(BigInt(s)) / 1e18;
    if (!Number.isFinite(n) || n < 0)
      return undefined;
    return Math.round(n * 1e6) / 1e6;
  }
  catch {
    return undefined;
  }
}

/**
 * @param {unknown} raw 整帧 JSON 或 data 对象
 * @returns {{ orderHash: string, orderId: string, type: string, settlement: PfWalletSettlement, executedSizeWei?: string, executedValueWei?: string, executedPriceWei?: string, feeAmountWei?: string, feeType?: PfWalletFeeType }|null}
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

  const fee = parsePredictWalletFee(ev["fee"] ?? details["fee"] ?? null);

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
    feeAmountWei: fee?.amountWei,
    feeType: fee?.type,
  };
}

/**
 * 将 wallet fee 挂到官方 OrderData（REST 无实扣费字段时用）
 * @param {object|null|undefined} official
 * @param {{ feeAmountWei?: string, feeType?: string }|null|undefined} hint
 */
export function attachWalletFeeToOfficial(official, hint) {
  if (!official || !hint)
    return official ?? null;
  /** @type {Record<string, unknown>} */
  const out = { ...official };
  if (hint.feeAmountWei) {
    out.pfWalletFee = {
      amountWei: String(hint.feeAmountWei),
      type: hint.feeType === "SHARES" ? "SHARES" : "COLLATERAL",
    };
  }
  if (hint.executedValueWei != null && String(hint.executedValueWei).trim())
    out.pfExecutedValueWei = String(hint.executedValueWei);
  return out;
}

/**
 * Wallet 终态提示 → 最小 OrderData（REST 滞后时的 fallback）
 * @param {{ orderHash: string, orderId?: string, type?: string, settlement: PfWalletSettlement, executedSizeWei?: string, executedValueWei?: string, feeAmountWei?: string, feeType?: string }} hint
 */
export function officialStubFromWalletHint(hint) {
  if (!hint || hint.settlement === "pending")
    return null;
  const hash = String(hint.orderHash ?? "").trim();
  if (hint.settlement === "filled") {
    const valueWei = hint.executedValueWei != null ? String(hint.executedValueWei) : undefined;
    let amountHuman;
    if (valueWei && /^\d+$/.test(valueWei)) {
      try {
        const n = Number(BigInt(valueWei)) / 1e18;
        if (Number.isFinite(n) && n > 0)
          amountHuman = String(Math.round(n * 1e6) / 1e6);
      }
      catch {
        /* ignore */
      }
    }
    const stub = {
      status: "FILLED",
      id: hint.orderId || undefined,
      amountFilled: hint.executedSizeWei,
      // 人类 USDT（含小数点，供 extractBuyFillCostUsdt / extractSellFill）
      ...(amountHuman && amountHuman.includes(".") ? { amount: amountHuman } : {}),
      ...(valueWei ? { pfExecutedValueWei: valueWei } : {}),
      order: {
        hash,
        // 与 wallet fill 一致：size / value（SELL 形；BUY 实付读 pfExecutedValueWei）
        makerAmount: hint.executedSizeWei,
        takerAmount: hint.executedValueWei,
      },
      pfWalletEvent: hint.type,
    };
    return attachWalletFeeToOfficial(stub, hint);
  }
  return {
    status: "CANCELLED",
    id: hint.orderId || undefined,
    order: { hash },
    pfWalletEvent: hint.type,
  };
}
