/**
 * FEATURE PROJECTION for Chrome extension content scripts — NOT ALL_VENUES / Catalog SoT.
 *
 * - Aligns A8 content bundle probe order (`Object.values(o)` Check).
 * - Includes A8 probe-only id `HGA` (not a Changmen Catalog Venue; do not add to manifest).
 * - Changmen Venue ids below MUST exist in `client/venue-adapter/registry/manifest.json`.
 * - Intentionally omits Catalog venues the extension does not probe (e.g. Limitless, PredictFun, SXBet, Azuro, XBet).
 *
 * PRIMARY Catalog: manifest.json · CI: `npm run check:venue-catalog`
 */
export const PLATFORMS = Object.freeze({
  OB: "OB",
  RAY: "RAY",
  IM: "IM",
  TF: "TF",
  IA: "IA",
  SABA: "SABA",
  PB: "PB",
  IMT: "IMT",
  /** A8 probe-only technical id — NOT a Changmen Catalog Venue */
  HGA: "HGA",
  HG: "HG",
  Stake: "Stake",
  /** [changmen 扩展] A8 插件无 — Catalog Venue */
  Dex: "Dex",
  /** [changmen 扩展] A8 插件无 — Catalog Venue */
  Polymarket: "Polymarket",
});

/**
 * 采集图标探测名单。
 * A8：对枚举全量 `Object.values(o)` 做 Check（含 IM/TF/HGA/HG），任意 frame，无 top 限制。
 * Dex/Polymarket 为 changmen 扩展，排在 A8 馆之后。
 */
export const PLATFORM_LIST = Object.values(PLATFORMS);
