import type { CollectHttpSession } from "@/collectors/shared/collectSession";
import { directPostJson } from "@/shared/http";
import { buildImtHeaders } from "@/collectors/imt/headers";

/** A8 HQe/GQe：IMT POST 直连 */
export async function collectImtPost<T>(
  session: CollectHttpSession,
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const base = session.gateway.replace(/\/+$/, "");
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = buildImtHeaders(session);
  return directPostJson<T>(url, headers, body);
}
