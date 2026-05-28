import type { CollectPlatformInfo } from "@/types/esport";
import { directGet } from "@/shared/http";

/** 对齐 A8 Ck(platform) */
function obHeaders(token: string): Record<string, string> {
  return {
    device: "1",
    lang: "cn",
    token,
    Accept: "application/json, text/plain, */*",
  };
}

/** A8 NMe：Rr.get(Nr) 直连 OB gateway — Axios/XHR，对齐 A8 */
export async function collectObGet<T>(
  platform: CollectPlatformInfo,
  path: string,
  query = "",
): Promise<T> {
  if (!platform.Gateway || !platform.Token) {
    throw new Error("OB collect platform not configured");
  }
  const base = platform.Gateway.replace(/\/+$/, "");
  const apiPath = path.startsWith("/") ? path : `/${path}`;
  const q = query ? (apiPath.includes("?") ? "&" : "?") + query : "";
  const url = `${base}${apiPath}${q}`;
  return directGet<T>(url, obHeaders(platform.Token));
}
