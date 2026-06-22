import { a8PluginSend, a8PluginGetStore, hasA8PluginRuntime } from "@/chrome-plugin/bridge";
import { PLATFORMS } from "@/shared/platform";

export interface DexCredentials {
  jwt: string;
  hash: string;
  nickname: string;
  network: string;
  currency: string;
  sportsbookToken: string;
  gateway: string;
  apiUrl: string;
}

export function isDexPluginAvailable(): boolean {
  return hasA8PluginRuntime();
}

export async function getDexTabId(): Promise<number | undefined> {
  if (!hasA8PluginRuntime()) return undefined;
  try {
    const response = await a8PluginGetStore(PLATFORMS.Dex);
    const root = response as { data?: Record<string, unknown>; response?: { data?: Record<string, unknown> } };
    const direct = root?.data?.[PLATFORMS.Dex];
    if (typeof direct === "number") return direct;
    const nested = root?.response?.data?.[PLATFORMS.Dex];
    if (typeof nested === "number") return nested;
    return undefined;
  } catch {
    return undefined;
  }
}

export async function getDexCredentials(tabId: number): Promise<DexCredentials | undefined> {
  try {
    const raw = await a8PluginSend({
      type: "getCredentials",
      data: {},
      options: { tabId },
    });
    const cred = raw as DexCredentials | undefined;
    if (!cred?.hash) return undefined;
    return cred;
  } catch {
    return undefined;
  }
}

export async function dexPluginGet<T>(
  tabId: number,
  url: string,
  headers?: Record<string, string>,
): Promise<T> {
  const raw = await a8PluginSend({
    type: "GET",
    url,
    options: { tabId, headers },
  });
  const envelope = raw as { data?: T; status?: number };
  return envelope?.data as T;
}

export async function dexPluginPost<T>(
  tabId: number,
  url: string,
  body: Record<string, unknown>,
  headers?: Record<string, string>,
): Promise<T> {
  const raw = await a8PluginSend({
    type: "POST",
    url,
    data: body,
    options: { tabId, headers },
  });
  const envelope = raw as { data?: T; status?: number };
  return envelope?.data as T;
}
