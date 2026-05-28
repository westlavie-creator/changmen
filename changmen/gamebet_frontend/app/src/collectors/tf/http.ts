import type { CollectPlatformInfo } from "@/types/esport";
import { directGet } from "@/shared/http";
import { tfRequestHeaders } from "@/collectors/tf/auth";

/** A8 NBe：浏览器直连 TF /api/v8/events/ */
export async function collectTfGet<T>(
  platform: CollectPlatformInfo,
  query: Record<string, string>,
): Promise<T> {
  if (!platform.Gateway || !platform.Token) {
    throw new Error("TF collect platform not configured");
  }
  const base = platform.Gateway.replace(/\/+$/, "");
  const qs = new URLSearchParams({
    combo: "false",
    outright: "false",
    lang: "zh",
    timezone: "Asia/Shanghai",
    ...query,
  });
  const url = `${base}/api/v8/events/?${qs}`;
  const headers = await tfRequestHeaders(platform.Token);
  return directGet<T>(url, headers);
}
