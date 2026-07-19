/**
 * Predict.fun 模式 A（主号 / house）：全站套利下单由 **VPS** 持 B 号私钥代签。
 * changmen 用户无需在 predict.fun 开户；用户 PlatformAccount 仅用于玩家/订单归属。
 *
 * 浏览器侧不再读取 VITE_* 私钥（防泄露）。联调若需本地验签，仅用管理员账号 token 回退（不推荐生产）。
 */

import type { PlatformAccount } from "@changmen/client-core/models/platformAccount";

import {
  parsePredictFunTokenConfig,
  resolvePredictFunPrivateKey,
  resolvePredictFunPrivyPrivateKey,
  resolvePredictFunPredictAccount,
  type PredictFunTokenConfig,
} from "./credentials";

export const PREDICT_FUN_ACCOUNT_MODE = "house" as const;

export interface PredictFunMasterCredentials {
  privateKey: string;
  predictAccount?: string;
  privyPrivateKey?: string;
  source: "env" | "account";
}

function credentialsFromConfig(
  config: PredictFunTokenConfig,
  source: PredictFunMasterCredentials["source"],
): PredictFunMasterCredentials | null {
  const predictAccount = resolvePredictFunPredictAccount(config);
  const privyPrivateKey = resolvePredictFunPrivyPrivateKey(config);
  const privateKey = resolvePredictFunPrivateKey(config) || privyPrivateKey;
  if (!privateKey)
    return null;
  return {
    privateKey,
    predictAccount: predictAccount || undefined,
    privyPrivateKey: privyPrivateKey || undefined,
    source,
  };
}

/**
 * @deprecated 浏览器下单已废弃；下单走 Pf_*。仅保留给运维脚本/测试探测。
 * 生产勿再通过 VITE_* 注入私钥。
 */
export function resolvePredictFunMasterCredentials(
  account?: PlatformAccount,
): PredictFunMasterCredentials | null {
  const cfg = parsePredictFunTokenConfig(account?.token);
  return credentialsFromConfig(cfg, "account");
}

export function isPredictFunHouseMode(): boolean {
  return true;
}

/** 用户侧账号是否仅需占位（无 predict.fun 凭证） */
export function isPredictFunHousePlaceholderAccount(account: PlatformAccount): boolean {
  const cfg = parsePredictFunTokenConfig(account.token);
  if (cfg.house === true || String(cfg.mode ?? "").toLowerCase() === "house")
    return true;
  if (resolvePredictFunPrivateKey(cfg) || resolvePredictFunPrivyPrivateKey(cfg))
    return false;
  return true;
}
