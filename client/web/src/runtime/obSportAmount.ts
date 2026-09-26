/**
 * 熊猫体育钱包。GET /yewu12/user/amount?uid=，不走电竞 /game/balance。
 */
import { getObSportPb } from "@/runtime/obSportFootballFetch";
import {
  isObSportMemberId,
  pickObSportBetAccount,
  sportObSessionFromAccount,
  type ObSportBetAccountLike,
} from "@/runtime/obSportBetAccount";
import { readPodBetSettings } from "@/runtime/podBetSettings";
import { readLocalSportObSession, type SportObSessionLocal } from "@/runtime/obSportSessionLocal";
import { resolveObSportHttpGateway } from "@/runtime/obSportTrial";
import { useAccountStore } from "@/stores/accountStore";

export const OB_SPORT_AMOUNT_PATH = "/yewu12/user/amount";

function asRecord(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : null;
}

export function parseObSportAmount(decoded: unknown): number {
  const root = asRecord(decoded) || {};
  const data = asRecord(root.data) || root;
  const n = Number(
    data.amount
    ?? data.gold
    ?? data.balance
    ?? data.availableBalance
    ?? root.amount
    ?? root.gold
    ?? root.balance,
  );
  if (!Number.isFinite(n))
    throw new Error("体育余额响应缺少有效金额");
  return n;
}

export function resolveObSportAmountSession(
  account?: ObSportBetAccountLike | null,
): SportObSessionLocal | null {
  const collect = readLocalSportObSession();
  const accountSession = sportObSessionFromAccount(account);
  const session = accountSession || (!account ? collect : null);
  if (!session?.token)
    return null;
  const next: SportObSessionLocal = { ...session };
  const sameCollectToken = Boolean(
    accountSession
    && collect?.token
    && String(collect.token).trim() === String(accountSession.token).trim(),
  );
  let uid = String(next.sessionId || next.uid || "").trim();
  if (!isObSportMemberId(uid) && sameCollectToken)
    uid = String(collect?.sessionId || collect?.uid || "").trim();
  next.sessionId = uid;
  next.uid = uid;
  const collectGw = sameCollectToken || !accountSession
    ? resolveObSportHttpGateway(
        String(collect?.gateway || collect?.lastGateway || ""),
        String(collect?.referer || ""),
      )
    : "";
  next.gateway = resolveObSportHttpGateway(
    String(next.gateway || ""),
    String(next.referer || collect?.referer || ""),
  ) || collectGw;
  return next;
}

export async function fetchObSportAmountForAccount(
  account?: ObSportBetAccountLike | null,
): Promise<number> {
  const session = resolveObSportAmountSession(account);
  if (!session?.token)
    throw new Error("未配置体育 OB 会话");
  const uid = String(session.sessionId || session.uid || "").trim();
  if (!isObSportMemberId(uid))
    throw new Error("体育账号缺少有效 UID");
  if (!session.gateway)
    throw new Error("sport OB session missing gateway");
  const decoded = await getObSportPb(OB_SPORT_AMOUNT_PATH, { uid }, session);
  return parseObSportAmount(decoded);
}

export async function fetchObSportAmount(): Promise<number> {
  const settings = readPodBetSettings();
  const account = pickObSportBetAccount(
    useAccountStore().accounts,
    settings.followAccountIds[0] || settings.followAccountId,
  );
  try {
    return await fetchObSportAmountForAccount(account);
  }
  catch {
    return 0;
  }
}
