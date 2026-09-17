/**
 * 熊猫体育钱包。GET /yewu12/user/amount?uid=，不走电竞 /game/balance。
 */
import { getObSportPb } from "@/runtime/obSportFootballFetch";
import {
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

function isPlaceholderSportUid(uid: string): boolean {
  return /^sport-/i.test(String(uid || "").trim());
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
  return Number.isFinite(n) ? n : 0;
}

export function resolveObSportAmountSession(
  account?: ObSportBetAccountLike | null,
): SportObSessionLocal | null {
  const collect = readLocalSportObSession();
  const session = sportObSessionFromAccount(account) || collect;
  if (!session?.token)
    return null;
  const next: SportObSessionLocal = { ...session };
  let uid = String(next.sessionId || next.uid || "").trim();
  if (!uid || isPlaceholderSportUid(uid))
    uid = String(collect?.sessionId || collect?.uid || "").trim();
  next.sessionId = uid;
  next.uid = uid;
  const collectGw = resolveObSportHttpGateway(
    String(collect?.gateway || collect?.lastGateway || ""),
    String(collect?.referer || ""),
  );
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
  if (!uid)
    throw new Error("体育账号缺少 uid");
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
