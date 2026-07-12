/**
 * Predict.fun 模式 A（主号）：全站套利下单共用运营者一个 Predict 账号。
 * changmen 用户无需在 predict.fun 开户；用户 PlatformAccount 仅用于玩家/订单归属。
 *
 * 凭证优先级：
 * 1. 构建环境变量（运营主号，推荐生产）
 * 2. changmen 里唯一配置了私钥的 PredictFun 平台账号 token（联调/单管理员）
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

function readEnv(name: string): string {
  if (typeof import.meta === "undefined")
    return "";
  return String((import.meta.env as Record<string, string | undefined>)?.[name] ?? "").trim();
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

function resolveFromEnv(): PredictFunMasterCredentials | null {
  const privateKey = readEnv("VITE_PREDICT_FUN_MASTER_PRIVATE_KEY")
    || readEnv("VITE_PREDICT_FUN_PRIVY_PRIVATE_KEY");
  const predictAccount = readEnv("VITE_PREDICT_FUN_PREDICT_ACCOUNT");
  if (!privateKey)
    return null;
  return {
    privateKey: privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`,
    predictAccount: predictAccount || undefined,
    privyPrivateKey: readEnv("VITE_PREDICT_FUN_PRIVY_PRIVATE_KEY") || undefined,
    source: "env",
  };
}

/** 模式 A：解析实际用于 JWT/下单的凭证（忽略用户 token 里的空占位） */
export function resolvePredictFunMasterCredentials(
  account?: PlatformAccount,
): PredictFunMasterCredentials | null {
  const fromEnv = resolveFromEnv();
  if (fromEnv)
    return fromEnv;

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
  return resolveFromEnv() != null;
}
