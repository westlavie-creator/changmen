/**
 * Sport N3 队名解析（只读本包 JSON；可选以后叠加 sport_canonical_teams）。
 * 禁止 import 电竞 team_db / fetchAllCanonicalTeams。
 */
import mlbAliasesRaw from "./sport_mlb_aliases.json" with { type: "json" };

/** @type {Map<string, string>|null} */
let mlbMap = null;

function loadMlbMap() {
  if (mlbMap)
    return mlbMap;
  mlbMap = new Map();
  for (const [k, v] of Object.entries(mlbAliasesRaw)) {
    if (k.startsWith("_"))
      continue;
    const key = String(k).trim().toLowerCase();
    const val = String(v).trim().toLowerCase();
    if (key && val)
      mlbMap.set(key, val);
  }
  return mlbMap;
}

/** 与 sport 合并对齐：去撇号后再折叠空白，避免 A's → "a s"。 */
export function baseNormSportTeamName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[''`´]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9一-鿿]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * @param {string} name
 * @param {string} [gameCode] mlb | soccer | …
 * @returns {string} 用于配对的 canonical key
 */
export function resolveSportTeamKey(name, gameCode = "mlb") {
  const n = baseNormSportTeamName(name);
  if (!n)
    return "";
  const game = String(gameCode || "mlb").toLowerCase();
  if (game === "mlb") {
    const map = loadMlbMap();
    return map.get(n) || n;
  }
  return n;
}

/**
 * @param {string} home
 * @param {string} away
 * @param {number} startTimeMs
 * @param {string} [gameCode]
 * @returns {string|null}
 */
export function sportPairKeyResolved(home, away, startTimeMs, gameCode = "mlb") {
  const game = String(gameCode || "mlb").toLowerCase().trim() || "mlb";
  const h = resolveSportTeamKey(home, game);
  const a = resolveSportTeamKey(away, game);
  if (!h || !a)
    return null;
  const t = Number(startTimeMs) || 0;
  if (t <= 0)
    return null;
  const bucket = Math.floor(t / (60 * 60 * 1000));
  const [x, y] = h < a ? [h, a] : [a, h];
  // 与电竞「同 Game 才匹配」对齐：mlb/kbo/npb（或 soccer/tennis）写入键前缀
  return `${game}|${x}|${y}|${bucket}`;
}

/**
 * 同步插件形状（供 merge / 测试）；不读 RDS。
 * @param {{ games?: string[] }} [opts]
 */
export function createSportTeamPlugin(opts = {}) {
  const games = (opts.games || ["mlb"]).map(g => String(g).toLowerCase());
  const defaultGame = games[0] || "mlb";
  return {
    resolveKey(name, gameCode) {
      const g = gameCode || defaultGame;
      if (games.length && !games.includes(String(g).toLowerCase()))
        return baseNormSportTeamName(name);
      return resolveSportTeamKey(name, g);
    },
    pairKey(home, away, startTimeMs, gameCode) {
      return sportPairKeyResolved(home, away, startTimeMs, gameCode || defaultGame);
    },
  };
}
