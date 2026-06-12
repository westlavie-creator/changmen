/** Vite/TS 入口：运行时逻辑在 market_catalog.mjs，此处仅 re-export。 */
// @ts-expect-error vue-tsc 暂不能解析同目录 .mjs 声明；见 market_catalog.mjs.d.ts
export { obLegacyWinBetName, iaLegacyWinBetName } from "./market_catalog.mjs";
