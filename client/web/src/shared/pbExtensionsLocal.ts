/**
 * [changmen 扩展] PB 总模式 — 仅本机 localStorage，不进 Extensions / RDS。
 *
 * 默认关 = A8（仅 live 写 fo，不采 prematch）。
 * 开 = changmen 扩展（live+prematch 双循环、赛前也写 fo；影子价等子开关另控）。
 */
export const PB_EXTENSIONS_LOCAL_KEY = "changmen:pbExtensions";

const LEGACY_LIVE_FO_ONLY_KEY = "changmen:pbLiveFoOnly";

export function readPbChangmenExtensionsLocal(): boolean {
  try {
    const cur = localStorage.getItem(PB_EXTENSIONS_LOCAL_KEY);
    if (cur === "1") return true;
    if (cur === "0") return false;
    // 旧键「仅 live 写 fo」：开 = A8 → 新总开关关
    const legacy = localStorage.getItem(LEGACY_LIVE_FO_ONLY_KEY);
    if (legacy === "1") return false;
    return false;
  }
  catch {
    return false;
  }
}

export function writePbChangmenExtensionsLocal(on: boolean): void {
  try {
    if (on)
      localStorage.setItem(PB_EXTENSIONS_LOCAL_KEY, "1");
    else
      localStorage.removeItem(PB_EXTENSIONS_LOCAL_KEY);
  }
  catch {
    /* private mode / quota */
  }
}
