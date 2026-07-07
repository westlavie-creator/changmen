import { a8PluginPost } from "@changmen/client-core/chrome-plugin/bridge";
import type { PlatformAccount } from "@changmen/client-core/models/platformAccount";

const STAKE_GRAPHQL_PATH = "https://stake.com/_api/graphql";

type PluginAxiosLike = { data?: unknown };

function unwrapPluginEnvelope(response: unknown): Record<string, unknown> {
  if (response && typeof response === "object" && "data" in response) {
    const data = (response as PluginAxiosLike).data;
    if (data && typeof data === "object" && !Array.isArray(data))
      return data as Record<string, unknown>;
    return {};
  }
  if (response && typeof response === "object" && !Array.isArray(response))
    return response as Record<string, unknown>;
  return {};
}

/** 对齐 A8 `by(account)` */
export function stakeAccountHeaders(account: Pick<PlatformAccount, "token">): Record<string, string> | undefined {
  if (!account.token) return undefined;
  return {
    "content-type": "application/json",
    "x-language": "zh",
    "x-access-token": account.token,
  };
}

/**
 * 对齐 A8 `Zn.post` → `r.data`：保留 GraphQL 顶层 `{ data, errors }`。
 */
export async function stakePluginGraphql(
  label: string,
  body: Record<string, unknown>,
  opts: { tabId: number; headers: Record<string, string> },
): Promise<Record<string, unknown>> {
  const raw = await a8PluginPost(`${STAKE_GRAPHQL_PATH}?${label}`, body, {
    tabId: opts.tabId,
    headers: opts.headers,
  });
  const envelope = unwrapPluginEnvelope(raw);
  if (envelope && typeof envelope === "object" && ("data" in envelope || "errors" in envelope)) {
    return envelope;
  }
  return { data: envelope };
}
