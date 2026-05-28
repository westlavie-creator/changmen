import { a8PluginGetStore } from "@/collectors/a8/pluginBridge";
import { PLATFORMS } from "@/shared/platform";
import { wait } from "@/shared/wait";

/** 对齐 A8 全局 `qs.tabId` */
let cachedTabId: number | undefined;

export function getStakeTabIdCached(): number | undefined {
  return cachedTabId;
}

export function setStakeTabIdCached(tabId: number | undefined) {
  cachedTabId = tabId;
}

export async function readStakeTabIdFromPlugin(): Promise<number | undefined> {
  const response = await a8PluginGetStore(PLATFORMS.Stake);
  const data = (response as { data?: Record<string, unknown> } | undefined)?.data;
  const tabId = data?.[PLATFORMS.Stake];
  return typeof tabId === "number" ? tabId : undefined;
}

/** 对齐 A8 `MQ`：最多 10 次、每次间隔 3s */
export async function waitForStakeTabId(maxAttempts = 10, intervalMs = 3000): Promise<number | undefined> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const tabId = await readStakeTabIdFromPlugin();
    if (tabId) {
      cachedTabId = tabId;
      return tabId;
    }
    if (attempt < maxAttempts - 1) await wait(intervalMs);
  }
  cachedTabId = undefined;
  return undefined;
}
