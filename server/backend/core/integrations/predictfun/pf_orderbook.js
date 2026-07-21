/**
 * [Predict 官方] orderbook 仅 Yes；买 No 须 getComplement。
 * @see https://dev.predict.fun/understanding-the-orderbook-685654m0
 */

export function getPredictComplement(price, decimalPrecision = 2) {
  const precision = Number.isFinite(decimalPrecision) && decimalPrecision >= 0
    ? Math.floor(Number(decimalPrecision))
    : 2;
  const factor = 10 ** precision;
  const raw = Number(price);
  if (!Number.isFinite(raw))
    return NaN;
  return (factor - Math.round(raw * factor)) / factor;
}

function normalizeBookLevels(levels) {
  const out = [];
  for (const level of levels ?? []) {
    if (!Array.isArray(level))
      continue;
    const price = Number(level[0]);
    const size = Number(level[1]);
    if (!Number.isFinite(price) || price <= 0 || price >= 1)
      continue;
    if (!Number.isFinite(size) || size <= 0)
      continue;
    out.push([price, size]);
  }
  return out;
}

function sortAsksAsc(levels) {
  return [...levels].sort((a, b) => a[0] - b[0]);
}

function sortBidsDesc(levels) {
  return [...levels].sort((a, b) => b[0] - a[0]);
}

export function isPredictYesOutcomeToken(tokenId, outcomes) {
  const tid = String(tokenId ?? "").trim();
  const list = outcomes ?? [];
  if (!tid || !list.length)
    return true;
  const match = list.find(o => String(o?.onChainId ?? "").trim() === tid);
  if (!match)
    return String(list[0]?.onChainId ?? "").trim() === tid;
  const name = String(match.name ?? "").trim().toLowerCase();
  if (name === "yes")
    return true;
  if (name === "no")
    return false;
  const indexSet = Number(match.indexSet);
  if (indexSet === 1)
    return true;
  if (indexSet === 2)
    return false;
  return String(list[0]?.onChainId ?? "").trim() === tid;
}

export function orderbookForOutcomeBuy(yesBook, opts) {
  const yesAsks = normalizeBookLevels(yesBook?.asks);
  const yesBids = normalizeBookLevels(yesBook?.bids);
  if (opts?.isYesOutcome) {
    return {
      marketId: yesBook?.marketId,
      updateTimestampMs: yesBook?.updateTimestampMs,
      asks: sortAsksAsc(yesAsks),
      bids: sortBidsDesc(yesBids),
    };
  }
  const precision = Number.isFinite(opts?.decimalPrecision)
    ? Number(opts.decimalPrecision)
    : 2;
  const noAsks = yesBids.map(([p, q]) => [getPredictComplement(p, precision), q]);
  const noBids = yesAsks.map(([p, q]) => [getPredictComplement(p, precision), q]);
  return {
    marketId: yesBook?.marketId,
    updateTimestampMs: yesBook?.updateTimestampMs,
    asks: sortAsksAsc(normalizeBookLevels(noAsks)),
    bids: sortBidsDesc(normalizeBookLevels(noBids)),
  };
}

export function bestAskFromPredictBook(book) {
  const asks = book?.asks ?? [];
  const first = asks[0];
  if (Array.isArray(first)) {
    const price = Number(first[0]);
    const size = Number(first[1]);
    if (Number.isFinite(price) && price > 0 && price < 1 && (!Number.isFinite(size) || size > 0))
      return price;
  }
  let best = Number.POSITIVE_INFINITY;
  for (const level of asks) {
    if (!Array.isArray(level))
      continue;
    const price = Number(level[0]);
    const size = Number(level[1]);
    if (Number.isFinite(price) && price > 0 && price < best && (!Number.isFinite(size) || size > 0))
      best = price;
  }
  return Number.isFinite(best) && best < 1 ? best : 0;
}

export function bestBidFromPredictBook(book) {
  const bids = book?.bids ?? [];
  const first = bids[0];
  if (Array.isArray(first)) {
    const price = Number(first[0]);
    const size = Number(first[1]);
    if (Number.isFinite(price) && price > 0 && price < 1 && (!Number.isFinite(size) || size > 0))
      return price;
  }
  let best = 0;
  for (const level of bids) {
    if (!Array.isArray(level))
      continue;
    const price = Number(level[0]);
    const size = Number(level[1]);
    if (Number.isFinite(price) && price > best && price < 1 && (!Number.isFinite(size) || size > 0))
      best = price;
  }
  return best > 0 ? best : 0;
}

export function filterAsksByMaxPrice(asks, maxPrice) {
  return (asks ?? []).filter(([price, size]) => {
    const p = Number(price);
    const s = Number(size);
    return Number.isFinite(p) && p > 0 && p <= maxPrice + 1e-9
      && Number.isFinite(s) && s > 0;
  });
}

/**
 * 限价内 asks 是否够 FOK 吃满本金（USDT）——与 PM calculateBuyMarketLimitPrice 同语义。
 * asks: [[price, sizeShares], ...]，已按价升序且已 filterAsksByMaxPrice。
 */
export function assertPredictFokBuyDepth(asks, apiBetMoney) {
  const amount = Number(apiBetMoney);
  if (!Number.isFinite(amount) || amount <= 0)
    throw new Error(`无效投注金额 ${apiBetMoney}`);

  let remaining = amount;
  let available = 0;
  for (const level of asks ?? []) {
    const price = Number(level[0]);
    const size = Number(level[1]);
    if (!(Number.isFinite(price) && price > 0 && price < 1
      && Number.isFinite(size) && size > 0))
      continue;
    const notional = price * size;
    available += notional;
    if (notional + 1e-9 >= remaining)
      return;
    remaining -= notional;
  }

  const availText = Number.isFinite(available) ? available.toFixed(2) : "0";
  throw new Error([
    "Predict.fun FOK 盘口深度不足",
    `- 需要 ${amount} USDT，限价内可立即成交约 ${availText} USDT`,
    "- FOK 要求整笔金额立即成交，否则整单取消。",
  ].join("\n"));
}

/** 卖出：只保留 bid >= minPrice 的档（保护底价） */
export function filterBidsByMinPrice(bids, minPrice) {
  const floor = Number(minPrice);
  const useFloor = Number.isFinite(floor) && floor > 0 && floor < 1;
  return (bids ?? []).filter(([price, size]) => {
    const p = Number(price);
    const s = Number(size);
    if (!(Number.isFinite(p) && p > 0 && p < 1 && Number.isFinite(s) && s > 0))
      return false;
    if (useFloor && p + 1e-9 < floor)
      return false;
    return true;
  });
}

export function executableBuyBook(yesBook, market, tokenId) {
  const isYes = isPredictYesOutcomeToken(tokenId, market?.outcomes);
  return orderbookForOutcomeBuy(yesBook, {
    isYesOutcome: isYes,
    decimalPrecision: market?.decimalPrecision ?? 2,
  });
}

/** 卖出用同一侧盘口（吃 bids） */
export function executableSellBook(yesBook, market, tokenId) {
  return executableBuyBook(yesBook, market, tokenId);
}
