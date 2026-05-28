import type { CollectPlatformInfo } from "@/types/esport";
import { directGet, directPostJson } from "@/shared/http";

function iaHeaders(token: string): Record<string, string> {
  return { token, Accept: "application/json, text/plain, */*" };
}

/** A8 CQe：IA GET gameListPageSplit */
export async function collectIaGet<T>(platform: CollectPlatformInfo, path: string): Promise<T> {
  if (!platform.Gateway || !platform.Token) {
    throw new Error("IA collect platform not configured");
  }
  const base = platform.Gateway.replace(/\/+$/, "");
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  return directGet<T>(url, iaHeaders(platform.Token));
}

/** A8 CQe：IA POST getPointsListSplit */
export async function collectIaPost<T>(
  platform: CollectPlatformInfo,
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  if (!platform.Gateway || !platform.Token) {
    throw new Error("IA collect platform not configured");
  }
  const base = platform.Gateway.replace(/\/+$/, "");
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  return directPostJson<T>(
    url,
    {
      ...iaHeaders(platform.Token),
      "Content-Type": "application/json",
    },
    body,
  );
}
