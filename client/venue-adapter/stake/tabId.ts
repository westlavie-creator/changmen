import { a8PluginGetStore, hasA8PluginRuntime } from "@changmen/client-core/chrome-plugin/bridge";
import { PLATFORMS } from "../shared/platforms";
import { wait } from "@changmen/client-core/shared/wait";

/** 对齐 A8 全局 `qs.tabId` */
let cachedTabId: number | undefined;

export function getStakeTabIdCached(): number | undefined {
  return cachedTabId;
}

export function setStakeTabIdCached(tabId: number | undefined) {
  cachedTabId = tabId;
}

/** 对齐 bundle `XZe`：`getStore(Stake)` → `response.data[Stake]` */
export function parseStakeTabIdFromStore(response: unknown): number | undefined {
  if (typeof response === "number") return response;
  const root = response as { data?: Record<string, unknown>; response?: { data?: Record<string, unknown> } };
  const direct = root?.data?.[PLATFORMS.Stake];
  if (typeof direct === "number") return direct;
  const nested = root?.response?.data?.[PLATFORMS.Stake];
  if (typeof nested === "number") return nested;
  return undefined;
}

export async function readStakeTabIdFromPlugin(): Promise<number | undefined> {
  if (!hasA8PluginRuntime()) return undefined;
  try {
    const response = await a8PluginGetStore(PLATFORMS.Stake);
    return parseStakeTabIdFromStore(response);
  } catch {
    return undefined;
  }
}

/** 登录后预取 tabId，减少首次 Stake 采集/下注等待 */
export function primeStakeTabId(): void {
  void readStakeTabIdFromPlugin().then((tabId) => {
    if (tabId) cachedTabId = tabId;
  });
}

/** 对齐 A8 `MQ`：最多 10 次、每次间隔 3s */
export function stakeTabIdHint(): string {
  if (!hasA8PluginRuntime()) {
    return "未安装 Gamebet 扩展；Stake 采集/下注需在 Chrome 中打开 stake.com";
  }
  return "未找到 Stake 标签页：请先在浏览器打开 stake.com 并由扩展绑定 tabId";
}

export async function waitForStakeTabId(maxAttempts = 10, intervalMs = 3000): Promise<number | undefined> {
  if (!hasA8PluginRuntime()) return undefined;
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
