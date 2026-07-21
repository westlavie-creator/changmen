/** [changmen 扩展] 高利润时放大总注（比例仍按 1/odds） */
export interface StakeScaleByProfitPrefs {
  /** 是否启用 */
  enabled: boolean;
  /**
   * implied 阈值（与 config.profit 同口径）。
   * 默认 1.05 = 利润 ≥ 5% 时触发。
   */
  minImplied: number;
  /** 触发后对两腿 betMoney 同乘的倍数（默认 2） */
  multiplier: number;
  /**
   * 触发加仓时，预检/下注换算是否忽略账号比例系数（rateConfig）。
   * 默认关闭：仍按账号比例缩放。
   */
  skipAccountRateOnScale: boolean;
}

/** [changmen 扩展] 控制台显示皮肤；不改 DOM 结构，仅换 CSS 令牌 */
export type UiTheme = "default" | "brutal";

export const UI_THEMES: readonly UiTheme[] = ["default", "brutal"];

/** [changmen 扩展] 用户中心「扩展」选项卡配置（Client_SaveData key=Extensions） */
export interface ExtensionPrefs extends Record<string, unknown> {
  /** BetRow 套利划线、利润角标、赔率 flash、EV 标记 */
  betRowUi: boolean;
  /** 比例 9999 单边模式：本侧是否参与自动套利预检（仍不自动下单） */
  singleLeg9999Precheck: boolean;
  /**
   * 9999 单边时，真下单腿改用参数配置的正 EV 金额（valueBetMoney）。
   * 预检腿保持原套利计划额。默认关闭。
   */
  singleLeg9999UseValueBetMoney: boolean;
  /** 利润达阈值时放大下注金额 */
  stakeScaleByProfit: StakeScaleByProfitPrefs;
  /**
   * 控制台 UI 皮肤。
   * default = 现有深色；brutal = neo-brutalism（粗边框/硬阴影/浅底）。
   */
  uiTheme: UiTheme;
}

export function normalizeUiTheme(raw: unknown): UiTheme {
  return raw === "brutal" ? "brutal" : "default";
}

export function createDefaultStakeScaleByProfit(): StakeScaleByProfitPrefs {
  return {
    enabled: false,
    minImplied: 1.05,
    multiplier: 2,
    skipAccountRateOnScale: false,
  };
}

export function createDefaultExtensionPrefs(): ExtensionPrefs {
  return {
    betRowUi: false,
    singleLeg9999Precheck: true,
    singleLeg9999UseValueBetMoney: false,
    stakeScaleByProfit: createDefaultStakeScaleByProfit(),
    uiTheme: "default",
  };
}

function normalizeStakeScaleByProfit(raw: unknown): StakeScaleByProfitPrefs {
  const defaults = createDefaultStakeScaleByProfit();
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    return defaults;
  const row = raw as Record<string, unknown>;
  const minImplied = Number(row.minImplied);
  const multiplier = Number(row.multiplier);
  return {
    enabled: row.enabled === true,
    minImplied: Number.isFinite(minImplied) && minImplied > 1 ? minImplied : defaults.minImplied,
    multiplier: Number.isFinite(multiplier) && multiplier > 0 ? multiplier : defaults.multiplier,
    skipAccountRateOnScale: row.skipAccountRateOnScale === true,
  };
}

export function normalizeExtensionPrefs(raw: unknown): ExtensionPrefs {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    return createDefaultExtensionPrefs();
  const row = raw as Record<string, unknown>;
  return {
    betRowUi: row.betRowUi === true,
    singleLeg9999Precheck: row.singleLeg9999Precheck !== false,
    singleLeg9999UseValueBetMoney: row.singleLeg9999UseValueBetMoney === true,
    stakeScaleByProfit: normalizeStakeScaleByProfit(row.stakeScaleByProfit),
    uiTheme: normalizeUiTheme(row.uiTheme),
  };
}
