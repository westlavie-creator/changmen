/** 对齐 A8 content bundle 平台枚举（顺序与 A8 `Object.values(o)` 一致） */
export const PLATFORMS = Object.freeze({
  OB: "OB",
  RAY: "RAY",
  IM: "IM",
  TF: "TF",
  IA: "IA",
  SABA: "SABA",
  PB: "PB",
  IMT: "IMT",
  HGA: "HGA",
  HG: "HG",
  Stake: "Stake",
  /** [changmen 扩展] A8 插件无 */
  Dex: "Dex",
  /** [changmen 扩展] A8 插件无 */
  Polymarket: "Polymarket",
  /** [changmen 扩展] A8 插件无 */
  Limitless: "Limitless",
  /** [changmen 扩展] A8 插件无 */
  SXBet: "SXBet",
  /** [changmen 扩展] A8 插件无 */
  Azuro: "Azuro",
  /** [changmen 扩展] A8 插件无 */
  PredictFun: "PredictFun",
  /** [changmen 扩展] A8 插件无 */
  XBet: "XBet",
});

/**
 * 采集图标探测名单。
 * A8：对枚举全量 `Object.values(o)` 做 Check（含 IM/TF/HGA/HG），任意 frame，无 top 限制。
 * Dex/Polymarket/Limitless/SXBet/Azuro/PredictFun/XBet 为 changmen 扩展，排在 A8 馆之后。
 */
export const PLATFORM_LIST = Object.values(PLATFORMS);
