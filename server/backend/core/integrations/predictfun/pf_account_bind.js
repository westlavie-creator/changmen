/**
 * 用户自签中继：绑定官网 ContractOrder.maker ↔ 玩家 Predict Account。
 * @see https://dev.predict.fun/doc-663127
 * @see https://dev.predict.fun/how-to-create-or-cancel-orders-679306m0
 *   Predict Account：maker/signer 必须是智能钱包地址（非 Privy EOA）
 */

import * as sb from "@changmen/db";

function normalizeEthAddress(value) {
  const s = String(value ?? "").trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(s))
    return "";
  return s.toLowerCase();
}

function predictAccountFromTokenJson(token) {
  if (token == null)
    return "";
  let obj = token;
  if (typeof token === "string") {
    const raw = token.trim();
    if (!raw)
      return "";
    try {
      obj = JSON.parse(raw);
    }
    catch {
      return normalizeEthAddress(raw);
    }
  }
  if (!obj || typeof obj !== "object")
    return "";
  return normalizeEthAddress(
    obj.predictAccount ?? obj.predict_account ?? obj.walletAddress ?? obj.address ?? "",
  );
}

/**
 * 从 players 行解析 Predict Account（venue_member_id 或 account_data.token）。
 * @param {{ venueMemberId?: string, accountData?: object }|null|undefined} player
 */
export function resolvePfPredictAccountAddress(player) {
  if (!player || typeof player !== "object")
    return "";
  const fromVenue = normalizeEthAddress(player.venueMemberId);
  if (fromVenue)
    return fromVenue;
  const data = player.accountData && typeof player.accountData === "object"
    ? player.accountData
    : {};
  const fromToken = predictAccountFromTokenJson(data.token ?? data.Token);
  if (fromToken)
    return fromToken;
  return normalizeEthAddress(data.predictAccount ?? data.predict_account ?? "");
}

/** 拉取含 venue/token 的玩家行（归属已由调用方校验） */
export async function loadPfPlayerPredictAccount(playerId) {
  const rows = await sb.fetchPlayersByIds([Number(playerId)]);
  const row = Array.isArray(rows) ? rows[0] : null;
  return resolvePfPredictAccountAddress(row);
}

/**
 * 校验已签单 maker（及可选 signer）与玩家 Predict Account 一致。
 * @returns {{ ok: true } | { ok: false, msg: string }}
 */
export function assertSignedOrderMatchesPredictAccount(createOrderBody, predictAccount) {
  const expected = normalizeEthAddress(predictAccount);
  if (!expected)
    return { ok: false, msg: "账号缺少 Predict Account（请重新保存智能钱包地址）" };

  const order = createOrderBody?.data?.order;
  if (!order || typeof order !== "object")
    return { ok: false, msg: "createOrderBody.data.order 必填" };

  const maker = normalizeEthAddress(order.maker);
  if (!maker)
    return { ok: false, msg: "已签单缺少 order.maker" };
  if (maker !== expected) {
    return {
      ok: false,
      msg: "已签单 maker 与账号 Predict Account 不一致（官网要求 maker=智能钱包）",
    };
  }

  const signer = normalizeEthAddress(order.signer);
  if (signer && signer !== expected) {
    return {
      ok: false,
      msg: "已签单 signer 与账号 Predict Account 不一致",
    };
  }

  return { ok: true };
}
