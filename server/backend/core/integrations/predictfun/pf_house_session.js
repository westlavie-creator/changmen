/**
 * Predict.fun house JWT 会话（与下单共用 Privy EOA / Predict Account 签名）
 * @see https://dev.predict.fun/ts-how-to-authenticate-your-api-requests-663127m0
 */

import { fetchPredictFunHouseJwt } from "./pf_auth.js";
import {
  resolvePredictFunApiBase,
  resolvePredictFunHouseCredentials,
} from "./house_credentials.js";

async function loadPredictSdk() {
  const [sdk, ethers] = await Promise.all([
    import("@predictdotfun/sdk"),
    import("ethers"),
  ]);
  return { sdk, ethers };
}

function resolvePredictChainId(apiBase) {
  return String(apiBase).includes("testnet") ? 97 : 56;
}

/**
 * 取得 house JWT（缓存于 pf_auth）。
 * @returns {Promise<{ jwt: string, maker: string, apiBase: string }>}
 */
export async function fetchPredictFunHouseOrderJwt() {
  const credentials = resolvePredictFunHouseCredentials();
  if (!credentials?.privateKey)
    throw new Error("未配置 Predict.fun 运营主号（PREDICT_FUN_PRIVY_PRIVATE_KEY）");

  const { sdk, ethers } = await loadPredictSdk();
  const { Wallet } = ethers;
  const { OrderBuilder, ChainId } = sdk;

  const apiBase = resolvePredictFunApiBase();
  const signer = new Wallet(credentials.privateKey);
  const predictAccount = String(credentials.predictAccount ?? "").trim();
  const chainId = resolvePredictChainId(apiBase) === 97
    ? ChainId.BnbTestnet
    : ChainId.BnbMainnet;
  const orderBuilder = predictAccount
    ? await OrderBuilder.make(chainId, signer, { predictAccount })
    : await OrderBuilder.make(chainId, signer);

  const maker = predictAccount || await signer.getAddress();
  const jwt = await fetchPredictFunHouseJwt({
    apiBase,
    signer: maker,
    signMessage: async (message) => {
      if (predictAccount && typeof orderBuilder.signPredictAccountMessage === "function")
        return orderBuilder.signPredictAccountMessage(message);
      return signer.signMessage(message);
    },
  });

  return { jwt, maker, apiBase };
}
