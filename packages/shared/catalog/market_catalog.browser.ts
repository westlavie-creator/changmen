/** Vite/TS 入口：运行时逻辑在 market_catalog.mjs，此处仅 re-export。 */
// @ts-expect-error vue-tsc bundler 不解析同目录 *.mjs.d.ts
export { getDefaultMarketCode, getPlatformRules, obLegacyWinBetName, obMatchesOddTypeId, iaLegacyWinBetName } from "./market_catalog.mjs";
