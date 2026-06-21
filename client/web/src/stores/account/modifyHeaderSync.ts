import type { PlatformAccount } from "@/models/platformAccount";
import { a8PluginSetStore, hasA8PluginRuntime } from "@/chrome-plugin/bridge";

/** 对齐 A8 `HBe` / `$Be` */
export const MODIFY_HEADER_KEY = "ModifyHeader";

export interface ModifyHeaderEntry {
  UrlPattern: string;
  UserAgent: string;
}

/** 对齐 A8 Io.f：从账号列表收集 gateway + userAgent */
export function collectModifyHeaderRules(accounts: PlatformAccount[]): ModifyHeaderEntry[] {
  const rules: ModifyHeaderEntry[] = [];
  for (const acc of accounts) {
    const pattern = acc.gateway?.trim();
    const ua = acc.userAgent?.trim();
    if (!pattern || !ua)
      continue;
    rules.push({ UrlPattern: pattern, UserAgent: ua });
  }
  return rules;
}

/** 推送 ModifyHeader 到扩展 DNR（无扩展时静默跳过） */
export async function syncModifyHeaderRules(accounts: PlatformAccount[]): Promise<void> {
  if (!hasA8PluginRuntime())
    return;
  const data = collectModifyHeaderRules(accounts);
  try {
    await a8PluginSetStore(MODIFY_HEADER_KEY, data);
  }
  catch {
    /* 扩展通信失败不阻断余额/账号主流程 */
  }
}
