/**
 * 熊猫体育钱包。GET /yewu12/user/amount?uid=，不走电竞 /game/balance。
 */
import { getObSportPb } from "@/runtime/obSportFootballFetch";
import { pickObSportBetAccount, sportObSessionFromAccount } from "@/runtime/obSportBetAccount";
import { readPodBetSettings } from "@/runtime/podBetSettings";
import { readLocalSportObSession } from "@/runtime/obSportSessionLocal";
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
  return Number.isFinite(n) ? n : 0;
}

export async function fetchObSportAmount(): Promise<number> {
  const settings = readPodBetSettings();
  const account = pickObSportBetAccount(useAccountStore().accounts, settings.followAccountId);
  const session = sportObSessionFromAccount(account) || readLocalSportObSession();
  if (!session?.token)
    return 0;
  const uid = String(session.sessionId || session.uid || "").trim();
  if (!uid)
    return 0;
  const collect = readLocalSportObSession();
  if (!session.gateway)
    session.gateway = String(collect?.gateway || "").trim();
  const decoded = await getObSportPb(OB_SPORT_AMOUNT_PATH, { uid }, session);
  return parseObSportAmount(decoded);
}
