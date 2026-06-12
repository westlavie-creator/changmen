/**
 * 浏览器/Vite 用：逻辑与 market_catalog.js obLegacyWinBetName 同步，避免 CJS 打包问题。
 */
import catalog from "./market_catalog.json";

const OB_MATCH_WINNER = catalog.markets.find((m) => m.code === "match_winner");
const OB_RULES = OB_MATCH_WINNER?.platforms?.OB;

let obBetNameRe: RegExp | undefined;

function obBetNamePattern(): RegExp {
  if (!obBetNameRe) {
    const src = OB_RULES?.betName ?? ".*";
    obBetNameRe = new RegExp(src);
  }
  return obBetNameRe;
}

/** 与 market_catalog.js obLegacyWinBetName 一致 */
export function obLegacyWinBetName(betName: string): boolean {
  const name = String(betName ?? "").trim();
  if (!name || name.includes("+")) return false;
  if (!OB_RULES?.betName) return false;
  for (const bad of OB_RULES.betKeyExcludeContains ?? []) {
    if (name.includes(bad)) return false;
  }
  if (/手枪局/.test(name)) return false;
  if (/第\d+回合/.test(name)) return false;
  if (!obBetNamePattern().test(name)) return false;
  if (/^\[地图\d+\]-/.test(name) && !name.includes("单局") && !name.includes("全局")) return false;
  return true;
}
