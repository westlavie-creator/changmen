import { post, unwrap } from "@/api/client";
import type { ClientMatchDto } from "@/types/esport";

export async function saveMatchSource(provider: string, matchs: unknown[]) {
  const data = await post<boolean>(`API_SaveMatch?${provider}`, {
    provider,
    matchs: JSON.stringify(matchs),
  });
  return data.success === 1 && data.info === true;
}

export async function saveBetSource(provider: string, matchId: string | number, bets: unknown[]) {
  const data = await post<boolean>(`API_SaveBet?${provider}`, {
    provider,
    matchId: String(matchId),
    bets: JSON.stringify(bets),
  });
  return data.success === 1 && data.info === true;
}

export async function saveLiveTimer(provider: string, timer: unknown[]) {
  const data = await post<boolean>(`API_SaveLiveTimer?${provider}`, {
    provider,
    timer: JSON.stringify(timer),
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
