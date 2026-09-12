/**
 * 足球跟单下单用侧栏 OB 账号的体育凭证（sportOb）。
 * 采集仍走 changmen.sportOb.session；禁止用电竞数字 token 和下注接口。
 */
import type { SportObSessionLocal } from "@/runtime/obSportSessionLocal";

export function isObSportBetToken(token: string): boolean {
  const t = String(token || "").trim();
  return /^[0-9a-f]{16,}$/i.test(t) && !/^\d+$/.test(t);
}

export type ObSportCredential = {
  token: string;
  gateway?: string;
  referer?: string;
  venueMemberId?: string;
};

export type ObSportBetAccountLike = {
  provider?: string;
  token?: string;
  gateway?: string;
  referer?: string;
  venueMemberId?: string;
  pause?: boolean;
  active?: boolean;
  sportOb?: ObSportCredential;
};

export function readObSportCredential(account: ObSportBetAccountLike | null | undefined): ObSportCredential | null {
  if (!account || String(account.provider || "") !== "OB")
    return null;
  const nested = account.sportOb;
  const nestedToken = String(nested?.token || "").trim();
  if (isObSportBetToken(nestedToken)) {
    return {
      token: nestedToken,
      gateway: String(nested?.gateway || "").trim(),
      referer: String(nested?.referer || "").trim(),
      venueMemberId: String(nested?.venueMemberId || "").trim(),
    };
  }
  const legacy = String(account.token || "").trim();
  if (!isObSportBetToken(legacy))
    return null;
  return {
    token: legacy,
    gateway: String(account.gateway || "").trim(),
    referer: String(account.referer || "").trim(),
    venueMemberId: String(account.venueMemberId || "").trim(),
  };
}

export function sportObSessionFromAccount(account: ObSportBetAccountLike | null | undefined): SportObSessionLocal | null {
  const cred = readObSportCredential(account);
  if (!cred)
    return null;
  const sessionId = String(cred.venueMemberId || "").trim();
  const gateway = String(cred.gateway || "").trim().replace(/\/$/, "");
  return {
    kind: "sport",
    token: cred.token,
    gateway,
    referer: String(cred.referer || "").trim(),
    sessionId,
    uid: sessionId,
  };
}

export function pickObSportBetAccount<T extends ObSportBetAccountLike>(accounts: T[]): T | null {
  const rows = accounts.filter(row => !row.pause && sportObSessionFromAccount(row));
  return rows.find(row => row.active) || rows[0] || null;
}
