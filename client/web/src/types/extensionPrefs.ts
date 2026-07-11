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
   * Polymarket 买单确认成交后自动挂 GTC 止盈卖单。
   * 默认开启（`!== false`）。
   */
  pmAutoExitSell: boolean;
  /**
   * 场馆 HK 出海 relay：HTTP/WS 经 changmen VPS（http-relay + ws-forward）代连需出海场馆（PM、Predict.fun 等）。
   * 生产构建（HK）默认开启；本地 dev 默认关闭。关闭时走 Chrome 扩展代发 HTTP。
   */
  venueHkEgress: boolean;
}

export function createDefaultStakeScaleByProfit(): StakeScaleByProfitPrefs {
  return {
    enabled: false,
    minImplied: 1.05,
    multiplier: 2,
    skipAccountRateOnScale: false,
  };
}

function productionVenueHkEgressDefault(): boolean {
  return import.meta.env.VITE_VENUE_HK_EGRESS_DEFAULT === "1";
}

function resolveVenueHkEgress(row: Record<string, unknown>): boolean {
  if (row.venueHkEgress === true || row.pmHkEgress === true)
    return true;
  if (row.venueHkEgress === false)
    return false;
  if (row.pmHkEgress === false && row.venueHkEgress === undefined)
    return false;
  return productionVenueHkEgressDefault();
}

export function createDefaultExtensionPrefs(): ExtensionPrefs {
  return {
    betRowUi: false,
    singleLeg9999Precheck: true,
    singleLeg9999UseValueBetMoney: false,
    stakeScaleByProfit: createDefaultStakeScaleByProfit(),
    pmAutoExitSell: true,
    venueHkEgress: productionVenueHkEgressDefault(),
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
    pmAutoExitSell: row.pmAutoExitSell !== false,
    venueHkEgress: resolveVenueHkEgress(row),
  };
}
