import { post, unwrap } from "@/api/client";
import {
  toA8LiveTimerRow,
  toA8SaveBetRow,
  toA8SaveMatchRow,
} from "@/api/collectWire";
import type { CollectBetDto, CollectMatchDto } from "@/types/collect";
import type { ClientMatchDto } from "@/types/esport";

export async function saveMatchSource(provider: string, matchs: unknown[]) {
  const wire = (matchs as CollectMatchDto[]).map(toA8SaveMatchRow);
  const data = await post<boolean>(`API_SaveMatch?${provider}`, {
    provider,
    matchs: JSON.stringify(wire),
  });
  return data.success === 1 && data.info === true;
}

export async function saveBetSource(provider: string, matchId: string | number, bets: unknown[]) {
  const wire = (bets as CollectBetDto[]).map(toA8SaveBetRow);
  const data = await post<boolean>(`API_SaveBet?${provider}`, {
    provider,
    matchId: String(matchId),
    bets: JSON.stringify(wire),
  });
  return data.success === 1 && data.info === true;
}

export async function saveLiveTimer(provider: string, timer: unknown[]) {
  const wire = (timer as Array<{ MatchID: string | number; Round: number; StartTime: number }>).map(
    toA8LiveTimerRow,
  );
  const data = await post<boolean>(`API_SaveLiveTimer?${provider}`, {
    provider,
    timer: JSON.stringify(wire),
  });
  return data.success === 1 && data.info === true;
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
  if (data.success !== 1 || !Array.isArray(data.info)) return [];
  return data.info;
}
