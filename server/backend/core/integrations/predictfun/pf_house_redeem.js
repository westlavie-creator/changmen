/**
 * House 主号：已 RESOLVED 仓位 redeem（回笼 USDT）
 * @see https://dev.predict.fun/how-to-create-or-cancel-orders-679306m0#how-to-redeem-positions
 * @see https://dev.predict.fun/get-positions-32675933e0
 */

import { predictFunGetAuth } from "./pf_api.js";
import { fetchPredictFunHouseOrderJwt } from "./pf_house_session.js";
import {
  resolvePredictFunApiBase,
  resolvePredictFunHouseCredentials,
} from "./house_credentials.js";

/** 同进程内已尝试 redeem 的 marketId，避免结算风暴重复打链 */
const redeemedMarketIds = new Set();

function resolvePredictChainId(apiBase) {
  return String(apiBase).includes("testnet") ? 97 : 56;
}

async function loadPredictSdk() {
  const [sdk, ethers] = await Promise.all([
    import("@predictdotfun/sdk"),
    import("ethers"),
  ]);
  return { sdk, ethers };
}

async function makeHouseOrderBuilder() {
  const credentials = resolvePredictFunHouseCredentials();
  if (!credentials?.privateKey)
    throw new Error("未配置 Predict.fun 运营主号");

  const { sdk, ethers } = await loadPredictSdk();
  const { Wallet } = ethers;
  const { OrderBuilder, ChainId } = sdk;
  const apiBase = resolvePredictFunApiBase();
  const signer = new Wallet(credentials.privateKey);
  const predictAccount = String(credentials.predictAccount ?? "").trim();
  const chainId = resolvePredictChainId(apiBase) === 97
    ? ChainId.BnbTestnet
    : ChainId.BnbMainnet;
  return predictAccount
    ? OrderBuilder.make(chainId, signer, { predictAccount })
    : OrderBuilder.make(chainId, signer);
}

/**
 * GET /v1/positions
 * @param {{ isResolved?: boolean, marketId?: string|number, first?: number }} [query]
 */
export async function fetchHousePredictPositions(query = {}) {
  const { jwt } = await fetchPredictFunHouseOrderJwt();
  const qs = new URLSearchParams();
  if (query.isResolved != null)
    qs.set("isResolved", String(Boolean(query.isResolved)));
  if (query.marketId != null && String(query.marketId).trim() !== "")
    qs.set("marketId", String(query.marketId));
  if (query.first != null)
    qs.set("first", String(query.first));
  const path = qs.toString() ? `/v1/positions?${qs}` : "/v1/positions";
  const res = await predictFunGetAuth(path, jwt);
  return Array.isArray(res?.data) ? res.data : [];
}

/**
 * 对单条仓位调用 SDK redeemPositions
 * @param {object} position PositionData
 * @param {Awaited<ReturnType<typeof makeHouseOrderBuilder>>} orderBuilder
 */
export async function redeemHousePosition(position, orderBuilder) {
  const market = position?.market ?? {};
  const outcome = position?.outcome ?? {};
  const conditionId = String(market.conditionId ?? "").trim();
  const indexSet = String(outcome.indexSet ?? "").trim();
  if (!conditionId || !indexSet)
    return { ok: false, msg: "position 缺少 conditionId/indexSet" };

  const isNegRisk = Boolean(market.isNegRisk);
  const isYieldBearing = Boolean(market.isYieldBearing);
  const amount = String(position.amount ?? "").trim();

  const params = {
    conditionId,
    indexSet,
    isNegRisk,
    isYieldBearing,
  };
  if (isNegRisk && amount)
    params.amount = amount;

  const result = await orderBuilder.redeemPositions(params);
  if (!result?.success) {
    return {
      ok: false,
      msg: String(result?.cause ?? result?.error ?? "redeem 失败"),
      result,
    };
  }
  return { ok: true, receipt: result.receipt, result };
}

/**
 * 拉取已结算仓位并 redeem（best-effort）
 * @param {{ marketId?: string|number, force?: boolean }} [opts]
 */
export async function redeemHouseResolvedPositions(opts = {}) {
  const marketId = opts.marketId != null ? String(opts.marketId).trim() : "";
  if (marketId && !opts.force && redeemedMarketIds.has(marketId)) {
    return { ok: true, skipped: true, redeemed: 0, failed: 0, marketId };
  }

  const positions = await fetchHousePredictPositions({
    isResolved: true,
    marketId: marketId || undefined,
    first: 50,
  });

  if (!positions.length) {
    if (marketId)
      redeemedMarketIds.add(marketId);
    return { ok: true, redeemed: 0, failed: 0, marketId: marketId || undefined };
  }

  const orderBuilder = await makeHouseOrderBuilder();
  let redeemed = 0;
  let failed = 0;
  const errors = [];

  for (const pos of positions) {
    const mid = String(pos?.market?.id ?? pos?.market?.marketId ?? "").trim();
    if (marketId && mid && mid !== marketId)
      continue;
    try {
      const r = await redeemHousePosition(pos, orderBuilder);
      if (r.ok)
        redeemed += 1;
      else {
        failed += 1;
        errors.push(r.msg);
      }
    }
    catch (err) {
      failed += 1;
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  if (marketId && failed === 0)
    redeemedMarketIds.add(marketId);

  return {
    ok: failed === 0,
    redeemed,
    failed,
    marketId: marketId || undefined,
    errors: errors.slice(0, 5),
  };
}

/** 结算后触发：不抛错，仅打日志 */
export async function tryRedeemHouseMarketAfterSettle(marketId) {
  const id = String(marketId ?? "").trim();
  if (!id)
    return;
  try {
    const r = await redeemHouseResolvedPositions({ marketId: id });
    if (r.redeemed > 0 || r.failed > 0) {
      console.info("[Pf_Redeem]", {
        marketId: id,
        redeemed: r.redeemed,
        failed: r.failed,
        errors: r.errors,
      });
    }
  }
  catch (err) {
    console.warn("[Pf_Redeem] skipped", id, err);
  }
}

/** @internal 单测 */
export function _resetRedeemedMarketIdsForTests() {
  redeemedMarketIds.clear();
}
