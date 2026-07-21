/** Vite/TS 入口：运行时逻辑在 market_catalog.ts，此处仅 re-export。 */
export {
  getDefaultMarketCode,
  getPlatformRules,
  iaLegacyWinBetName,
  obLegacyWinBetName,
  obMatchesOddTypeId,
  rayMatchesOddGroupId,
} from "./market_catalog.js";
