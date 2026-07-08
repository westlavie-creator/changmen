/** [changmen 扩展] 用户中心「扩展」选项卡配置（Client_SaveData key=Extensions） */
export interface ExtensionPrefs extends Record<string, unknown> {
  /** BetRow 套利划线、利润角标、赔率 flash、EV 标记 */
  betRowUi: boolean;
  /** 比例 9999 单边模式：本侧是否参与自动套利预检（仍不自动下单） */
  singleLeg9999Precheck: boolean;
}

export function createDefaultExtensionPrefs(): ExtensionPrefs {
  return { betRowUi: false, singleLeg9999Precheck: true };
}

export function normalizeExtensionPrefs(raw: unknown): ExtensionPrefs {
  const defaults = createDefaultExtensionPrefs();
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    return defaults;
  const row = raw as Record<string, unknown>;
  return {
    betRowUi: row.betRowUi === true,
    singleLeg9999Precheck: row.singleLeg9999Precheck !== false,
  };
}
