import { buildEsportPath } from "@changmen/api-contract/urls";

/**
 * [changmen 扩展] 从 PerformanceResourceTiming 读取刚完成的 esport POST 网络耗时。
 * 对齐 DevTools Network 列（requestStart → responseEnd），不含主线程 finally 排队。
 */
export function readEsportNetworkMs(action: string, startedPerf: number): number | undefined {
  if (typeof performance === "undefined" || !action)
    return undefined;

  const pathNeedle = buildEsportPath(action);
  const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
  let picked: PerformanceResourceTiming | undefined;

  for (const entry of entries) {
    if (!entry.name.includes(pathNeedle))
      continue;
    if (entry.startTime < startedPerf - 50)
      continue;
    if (entry.responseEnd <= 0 || entry.requestStart <= 0)
      continue;
    if (!picked || entry.responseEnd > picked.responseEnd)
      picked = entry;
  }

  if (!picked)
    return undefined;
  return Math.max(0, Math.round(picked.responseEnd - picked.requestStart));
}
