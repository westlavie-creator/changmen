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

/**
 * [changmen 扩展] 套利失败敞口自动减仓。
 * 一腿 PM/PF 已成交、对侧拒单且未能入补单队列（或补单随后放弃）时，市价卖掉已成交预测市场腿。
 * 默认关闭；不做止盈，仅风控减仓。
 *
 * 暂不可开启：与 A8 补单 prune 叠加有误卖敞口风险，待 staging 验证后再放开。
 * 放开时：改 `ARB_FAIL_AUTO_SELL_AVAILABLE`、UI 开关，并恢复 normalize 对 enabled 的解析。
 */
export interface ArbFailAutoSellPrefs {
  enabled: boolean;
}

/** 失败减仓是否允许用户开启（临时锁死） */
export const ARB_FAIL_AUTO_SELL_AVAILABLE = false;

/**
 * [changmen 扩展] 双边预测市场提前锁利。
 * 仅当套利 Link 两边都是可卖的 PM/PF 时生效：两边同时市价卖出，
 * 卖出净利 ≥ 锁定利润 × (1 + minExtraProfitPct/100) 才触发。
 * 庄+预测市场不触发（避免打单边）。默认关闭。
 */
export interface ArbEarlyLockSellPrefs {
  enabled: boolean;
  /**
   * 遗留字段（旧版 pmEdge/floor）。新逻辑固定「双边同卖净利 vs 锁定利润」，忽略 mode。
   * 保留以免旧 Clients 反序列化炸掉。
   */
  mode: "pmEdge" | "floor";
  /**
   * 相对锁定利润至少再多出的百分比（默认 0）。
   * 例：10 = 同卖净利 ≥ 锁定利润 × 1.10。旧字段 minExtraProfit（CNY）忽略。
   */
  minExtraProfitPct: number;
}

/** [changmen 扩展] 控制台显示皮肤；不改 DOM 结构，仅换 CSS 令牌 */
export type UiTheme = "default" | "brutal" | "paper" | "terminal";

export const UI_THEMES: readonly UiTheme[] = ["default", "brutal", "paper", "terminal"];

/** 浅色皮：需去掉 html.dark，避免 EP 深色变量压过 */
export const LIGHT_UI_THEMES: ReadonlySet<UiTheme> = new Set(["brutal", "paper"]);

export function isLightUiTheme(theme: UiTheme): boolean {
  return LIGHT_UI_THEMES.has(theme);
}

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
  /** 套利失败敞口：自动卖掉已成交的 PM/PF 腿 */
  arbFailAutoSell: ArbFailAutoSellPrefs;
  /** 双边预测市场：同卖净利优于锁定利润时两边一起卖 */
  arbEarlyLockSell: ArbEarlyLockSellPrefs;
  /**
   * 控制台 UI 皮肤。
   * default = 现有深色；brutal = 粗边框；paper = 浅纸感；terminal = 终端风。
   */
  uiTheme: UiTheme;
}

export function normalizeUiTheme(raw: unknown): UiTheme {
  if (raw === "brutal" || raw === "paper" || raw === "terminal")
    return raw;
  return "default";
}

export function createDefaultStakeScaleByProfit(): StakeScaleByProfitPrefs {
  return {
    enabled: false,
    minImplied: 1.05,
    multiplier: 2,
    skipAccountRateOnScale: false,
  };
}

export function createDefaultArbFailAutoSell(): ArbFailAutoSellPrefs {
  return { enabled: false };
}

export function createDefaultArbEarlyLockSell(): ArbEarlyLockSellPrefs {
  return {
    enabled: false,
    mode: "floor",
    minExtraProfitPct: 0,
  };
}

export function createDefaultExtensionPrefs(): ExtensionPrefs {
  return {
    betRowUi: false,
    singleLeg9999Precheck: true,
    singleLeg9999UseValueBetMoney: false,
    stakeScaleByProfit: createDefaultStakeScaleByProfit(),
    arbFailAutoSell: createDefaultArbFailAutoSell(),
    arbEarlyLockSell: createDefaultArbEarlyLockSell(),
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

function normalizeArbFailAutoSell(raw: unknown): ArbFailAutoSellPrefs {
  if (!ARB_FAIL_AUTO_SELL_AVAILABLE)
    return createDefaultArbFailAutoSell();
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    return createDefaultArbFailAutoSell();
  const row = raw as Record<string, unknown>;
  return { enabled: row.enabled === true };
}

function normalizeArbEarlyLockSell(raw: unknown): ArbEarlyLockSellPrefs {
  const defaults = createDefaultArbEarlyLockSell();
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    return defaults;
  const row = raw as Record<string, unknown>;
  const pct = Number(row.minExtraProfitPct);
  return {
    enabled: row.enabled === true,
    // 新逻辑忽略 mode；normalize 仍落合法值以免脏数据
    mode: row.mode === "pmEdge" ? "pmEdge" : "floor",
    // 不迁移旧 minExtraProfit（CNY），避免把「多 20 块」误读成 20%
    minExtraProfitPct: Number.isFinite(pct) && pct >= 0 && pct <= 500
      ? pct
      : defaults.minExtraProfitPct,
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
    arbFailAutoSell: normalizeArbFailAutoSell(row.arbFailAutoSell),
    arbEarlyLockSell: normalizeArbEarlyLockSell(row.arbEarlyLockSell),
    uiTheme: normalizeUiTheme(row.uiTheme),
  };
}
