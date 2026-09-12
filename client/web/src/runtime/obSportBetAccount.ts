/**
 * 足球跟单下单用侧栏 OB 下注账号的体育 token。
 * 采集仍走 changmen.sportOb.session；禁止用电竞数字 token 和下注接口。
 */
import type { SportObSessionLocal } from "@/runtime/obSportSessionLocal";

export function isObSportBetToken(token: string): boolean {
  const t = String(token || "").trim();
  return /^[0-9a-f]{16,}$/i.test(t) && !/^\d+$/.test(t);
}

export type ObSportBetAccountLike = {
  provider?: string;
  token?: string;
  gateway?: string;
  referer?: string;
  venueMemberId?: string;
  pause?: boolean;
  active?: boolean;
};

export function sportObSessionFromAccount(account: ObSportBetAccountLike | null | undefined): SportObSessionLocal | null {
  if (!account || String(account.provider || "") !== "OB")
    return null;
  const token = String(account.token || "").trim();
  if (!isObSportBetToken(token))
    return null;
  const sessionId = String(account.venueMemberId || "").trim();
  const gateway = String(account.gateway || "").trim().replace(/\/$/, "");
  return {
    kind: "sport",
    token,
    gateway,
    referer: String(account.referer || "").trim(),
    sessionId,
    uid: sessionId,
  };
}

export function pickObSportBetAccount<T extends ObSportBetAccountLike>(accounts: T[]): T | null {
  const rows = accounts.filter(row => !row.pause && sportObSessionFromAccount(row));
  return rows.find(row => row.active) || rows[0] || null;
}
