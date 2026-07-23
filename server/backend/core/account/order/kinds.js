/**
 * PM / PF / 场馆订单种类判定（读 raw 或 save 入参）。
 * 不写库。由 order_store / link 使用；isPredictionSellForCount 对外 re-export。
 */

export function orderRaw(row) {
  return row?.raw && typeof row.raw === "object" && !Array.isArray(row.raw)
    ? row.raw
    : {};
}

export function predictionSellBuyIdFromRaw(row) {
  const raw = orderRaw(row);
  const provider = String(row?.provider || "").trim();
  if (provider === "Polymarket" && String(raw.pmSide || "").toLowerCase() === "sell")
    return String(raw.pmBuyOrderId || "").trim();
  if (provider === "PredictFun" && String(raw.pfSide || "").toLowerCase() === "sell")
    return String(raw.pfBuyOrderId || "").trim();
  return "";
}

export function isPredictionBuyRawRow(row) {
  const raw = orderRaw(row);
  const provider = String(row?.provider || "").trim();
  if (provider === "Polymarket")
    return String(raw.pmSide || "").toLowerCase() !== "sell";
  if (provider === "PredictFun")
    return String(raw.pfSide || "").toLowerCase() !== "sell";
  return false;
}

export function isPredictionSellRawRow(row) {
  return Boolean(predictionSellBuyIdFromRaw(row));
}

/** 笔数统计用：PM/PF 卖单不计（不论是否挂上买单 id） */
export function isPredictionSellForCount(row) {
  const raw = orderRaw(row);
  const provider = String(row?.provider || "").trim();
  if (provider === "Polymarket")
    return String(raw.pmSide || "").toLowerCase() === "sell";
  if (provider === "PredictFun")
    return String(raw.pfSide || "").toLowerCase() === "sell";
  return false;
}

/** PM / PF 卖单：side + 父买单 id（save 路径用入参+prevRaw） */
export function predictionSellMetaFromSave(o, prevRaw, provider) {
  const p = String(provider || "").trim();
  if (p === "Polymarket") {
    return {
      isSell: String(o.pmSide ?? prevRaw.pmSide ?? "").toLowerCase() === "sell",
      buyOrderId: String(o.pmBuyOrderId ?? prevRaw.pmBuyOrderId ?? "").trim(),
    };
  }
  if (p === "PredictFun") {
    return {
      isSell: String(o.pfSide ?? prevRaw.pfSide ?? "").toLowerCase() === "sell",
      buyOrderId: String(o.pfBuyOrderId ?? prevRaw.pfBuyOrderId ?? "").trim(),
    };
  }
  return { isSell: false, buyOrderId: "" };
}
