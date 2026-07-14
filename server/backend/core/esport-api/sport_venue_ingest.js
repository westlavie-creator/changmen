/**
 * N3：ClientMatchDto[] → sport_venue_* 行（禁止写电竞 platform_*）。
 */
import { createHash } from "node:crypto";

/**
 * @param {string} sport baseball|football
 * @param {object[]} list ClientMatchDto[]
 * @returns {{ matches: object[], bets: object[] }}
 */
export function clientMatchDtosToSportVenueRows(sport, list) {
  const matches = [];
  const bets = [];
  const sportKey = String(sport);
  const now = Date.now();
  const seenMatch = new Set();

  for (const m of list || []) {
    for (const bet of m?.Bets || []) {
      for (const [key, src] of Object.entries(bet.Sources || {})) {
        if (!src)
          continue;
        const venue = String(src.Type || key);
        const sourceMatchId = String(
          m.Matchs?.[venue]
          ?? m.Matchs?.[key]
          ?? src.BetID
          ?? m.ID
          ?? "",
        );
        if (!sourceMatchId)
          continue;

        const mk = `${sportKey}|${venue}|${sourceMatchId}`;
        if (!seenMatch.has(mk)) {
          seenMatch.add(mk);
          matches.push({
            sport: sportKey,
            venue,
            source_match_id: sourceMatchId,
            match_id: null,
            source_game_id: m.Game != null ? String(m.Game) : null,
            start_time: m.StartTime != null ? Number(m.StartTime) : null,
            home_id: src.HomeID != null ? String(src.HomeID) : null,
            home: String(bet.HomeName || ""),
            away_id: src.AwayID != null ? String(src.AwayID) : null,
            away: String(bet.AwayName || ""),
            teams: [
              { name: bet.HomeName, id: src.HomeID },
              { name: bet.AwayName, id: src.AwayID },
            ],
            synced_at: now,
          });
        }

        bets.push({
          sport: sportKey,
          venue,
          source_match_id: sourceMatchId,
          source_bet_id: String(src.BetID || bet.ID || `${sourceMatchId}-ml`),
          map: Number(bet.Map) || 0,
          market_code: "moneyline",
          line: null,
          bet_name: String(bet.Name || "Moneyline"),
          home_odds: Number(src.HomeOdds) || 0,
          away_odds: Number(src.AwayOdds) || 0,
          is_locked: String(src.Status || "").toLowerCase() === "locked"
            || !(Number(src.HomeOdds) > 0 && Number(src.AwayOdds) > 0),
          source_home_id: src.HomeID != null ? String(src.HomeID) : null,
          source_away_id: src.AwayID != null ? String(src.AwayID) : null,
          updated_at: now,
        });
      }
    }
  }

  return { matches, bets };
}

/**
 * 稳定合并列表 id（不占用电竞 id 段；棒/足 idBase 约 8–9e8）。
 * @param {string} sport
 * @param {string} mergeKey
 */
export function sportMergedMatchId(sport, mergeKey) {
  const h = createHash("sha1").update(`${sport}|${mergeKey}`).digest();
  const n = h.readUInt32BE(0) % 90_000_000;
  return 700_000_000 + n;
}

export function normTeamName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9一-鿿]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** 1h bucket，跨场馆开赛时间对齐 */
export function startTimeBucket(ms) {
  const t = Number(ms) || 0;
  return Math.floor(t / (60 * 60 * 1000));
}

/**
 * 主客序无关的配对键。
 * 无有效开赛时间时返回 null（禁止靠队名裸合并，避免误拼）。
 * @param {string} home
 * @param {string} away
 * @param {number} startTimeMs
 */
export function sportPairKey(home, away, startTimeMs) {
  const h = normTeamName(home);
  const a = normTeamName(away);
  if (!h || !a)
    return null;
  const t = Number(startTimeMs) || 0;
  if (t <= 0)
    return null;
  const [x, y] = h < a ? [h, a] : [a, h];
  return `${x}|${y}|${startTimeBucket(t)}`;
}
