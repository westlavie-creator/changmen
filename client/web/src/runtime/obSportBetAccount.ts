/**
 * 足球跟单下单用侧栏 OB 账号的体育凭证（sportOb）。
 * 采集仍走 changmen.sportOb.session；禁止用电竞数字 token 和下注接口。
 */
import type { SportObSessionLocal } from "@/runtime/obSportSessionLocal";
import { resolveObSportHttpGateway } from "@/runtime/obSportTrial";

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
  accountId?: number;
  provider?: string;
  platformName?: string;
  playerName?: string;
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
  const referer = String(cred.referer || "").trim();
  const gateway = resolveObSportHttpGateway(String(cred.gateway || "").trim(), referer);
  return {
    kind: "sport",
    token: cred.token,
    gateway,
    referer,
    sessionId,
    uid: sessionId,
  };
}

export function pickObSportBetAccount<T extends ObSportBetAccountLike>(
  accounts: T[],
  accountId = 0,
): T | null {
  return pickObSportBetAccounts(accounts, accountId > 0 ? [accountId] : [])[0] || null;
}

/** 多选跟单账号。ids 空 = 未暂停里第一个有体育 token 的（与旧 followAccountId=0 一致）。 */
export function pickObSportBetAccounts<T extends ObSportBetAccountLike>(
  accounts: T[],
  accountIds: Iterable<number> = [],
): T[] {
  const rows = accounts.filter(row => !row.pause && sportObSessionFromAccount(row));
  const wants = [...new Set([...accountIds].map(n => Math.round(Number(n) || 0)).filter(n => n > 0))];
  if (!wants.length) {
    const one = rows.find(row => row.active) || rows[0];
    return one ? [one] : [];
  }
  const out: T[] = [];
  for (const want of wants) {
    const hit = rows.find(row => Number(row.accountId) === want);
    if (hit)
      out.push(hit);
  }
  return out;
}

export function listObSportFollowAccounts<T extends ObSportBetAccountLike>(accounts: T[]): T[] {
  return accounts.filter(row => !row.pause && sportObSessionFromAccount(row));
}

export function readObSportDisplayBalance(
  account: ObSportBetAccountLike & { sportBalance?: number },
): number | undefined {
  if (!sportObSessionFromAccount(account))
    return undefined;
  const n = Number(account.sportBalance);
  return Number.isFinite(n) ? n : undefined;
}
