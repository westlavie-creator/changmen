import { post, unwrap } from "@/api/client";
import type { CollectPlatformInfo } from "@/types/esport";

export async function getCollectPlatform(provider: string) {
  const data = await post<CollectPlatformInfo>("Client_GetCollectPlatform", { provider });
  if (data.success !== 1) return null;
  return data.info ?? null;
}

export async function getGames(provider: string) {
  const data = await post<string[]>("Client_GetGames", { provider });
  if (data.success !== 1 || !Array.isArray(data.info)) return [];
  return data.info.filter(Boolean).map(String);
}

export async function updatePlatform(body: Record<string, unknown>) {
  return unwrap(await post<unknown>("API_UpdatePlatform", body));
}
