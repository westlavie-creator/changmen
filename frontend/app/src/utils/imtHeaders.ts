import type { CollectHttpSession } from "@/utils/collectSession";
import { IMT_DEFAULT_X_SC } from "@/utils/imtCore";

export interface ImtTokenPayload {
  tk?: string;
  v?: string;
}

/** 对齐 A8 zQe / backend imt_session.decodeToken */
export function decodeImtToken(raw: string): ImtTokenPayload | null {
  if (!raw) return null;
  try {
    const json = atob(raw);
    return JSON.parse(json) as ImtTokenPayload;
  } catch {
    return null;
  }
}

/** 对齐 A8 Cee / backend imt_session.buildHeaders */
export function buildImtHeaders(session: CollectHttpSession): Record<string, string> {
  const decoded = decodeImtToken(session.token);
  return {
    "content-type": "application/json; charset=utf-8",
    referer: session.referer || session.gateway,
    "user-agent":
      session.userAgent ||
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "x-isfacelift": "true",
    "x-lang": "hans",
    "x-platform": "1",
    "x-sc": session.xSc || IMT_DEFAULT_X_SC,
    "x-token": decoded?.tk || "",
    "x-v": decoded?.v || "",
    "x-viewtype": "1",
  };
}
