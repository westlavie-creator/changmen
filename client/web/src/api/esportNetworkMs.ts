/**
 * [changmen 扩展] 从 PerformanceResourceTiming 读取 esport POST 的网络段耗时。
 * 对齐 DevTools Network（不含主线程排队到 finally 的时间）。
 */
export function readEsportNetworkMs(
  action: string,
  requestUrl: string,
  startedPerf: number,
): number | undefined {
  if (typeof performance === "undefined" || !action)
    return undefined;

  const needles = [
    requestUrl,
    `/esport/${action}`,
    action,
  ].filter(Boolean);

  const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
  let picked: PerformanceResourceTiming | undefined;

  for (const entry of entries) {
    if (!needles.some(n => entry.name.includes(n)))
      continue;
    if (entry.startTime < startedPerf - 500)
      continue;
    if (entry.responseEnd <= 0)
      continue;
    if (!picked || entry.responseEnd > picked.responseEnd)
      picked = entry;
  }

  if (!picked)
    return undefined;

  const fromRequest = picked.requestStart > 0
    ? picked.responseEnd - picked.requestStart
    : 0;
  const raw = picked.duration > 0 ? picked.duration : fromRequest;
  return Math.max(0, Math.round(raw));
}
