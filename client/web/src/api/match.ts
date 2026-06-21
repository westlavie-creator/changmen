import type { CollectBetDto, CollectMatchDto } from "@/types/collect";
import type { ClientMatchDto } from "@/types/esport";
import { post, postForm, unwrap } from "@/api/client";
import {
  toA8LiveTimerRow,
  toA8SaveBetRow,
  toA8SaveMatchRow,
} from "@/api/collectWire";

/** [A8 可证实] `Ar.post`：application/x-www-form-urlencoded，失败不抛错，以 success===1 为准 */
async function postCollectApi(action: string, fields: Record<string, string>): Promise<boolean> {
  try {
    const data = await postForm<boolean>(action, fields);
    return data.success === 1;
  }
  catch {
    return false;
  }
}

export async function saveMatchSource(provider: string, matchs: unknown[]) {
  const wire = (matchs as CollectMatchDto[]).map(toA8SaveMatchRow);
  return postCollectApi(`API_SaveMatch?${provider}`, {
    provider,
    matchs: JSON.stringify(wire),
  });
}

export async function saveBetSource(provider: string, matchId: string | number, bets: unknown[]) {
  const wire = (bets as CollectBetDto[]).map(toA8SaveBetRow);
  return postCollectApi(`API_SaveBet?${provider}`, {
    provider,
    matchId: String(matchId),
    bets: JSON.stringify(wire),
  });
}

/** [A8 可证实] `Ut.saveLiveTimer` → POST `API_SaveLiveTimer?{provider}` form: provider + timer */
export async function saveLiveTimer(provider: string, timer: unknown[]) {
  const wire = (timer as Array<{ MatchID: string | number; Round: number; StartTime: number }>).map(
    toA8LiveTimerRow,
  );
  return postCollectApi(`API_SaveLiveTimer?${provider}`, {
    provider,
    timer: JSON.stringify(wire),
  });
}

export async function saveScore(body: Record<string, unknown>) {
  return unwrap(await post<boolean>("API_SaveScore", body));
}

export async function getMatchs(userName: string) {
  const data = await post<ClientMatchDto[]>(
    "Client_GetMatchs",
    {},
    `?user=${encodeURIComponent(userName)}`,
  );
  if (data.success !== 1 || !Array.isArray(data.info))
    return [];
  return data.info;
}
