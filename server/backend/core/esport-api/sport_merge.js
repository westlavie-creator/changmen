/**
 * N3 sport moneyline 合并：当次列表内存合并（API）+ 异步落库。
 * 禁止触碰电竞 client_matches / platform_* / team_db。
 */
import {
  pruneSportVenueSnapshot,
  replaceSportClientMatches,
  setSportVenueMatchId,
  upsertSportVenueBets,
  upsertSportVenueMatches,
} from "@changmen/db";
import { createSportTeamPlugin } from "@changmen/team-resolver/sport_team_plugin.js";
import {
  clientMatchDtosToSportVenueRows,
  sportMergedMatchId,
} from "./sport_venue_ingest.js";

const VENUE_PRIORITY = ["Polymarket", "PredictFun"];

/** @type {ReturnType<typeof createSportTeamPlugin>} */
const sportTeams = createSportTeamPlugin({ games: ["mlb", "soccer"] });

function gameCodeForSport(sport, legGame) {
  if (legGame)
    return String(legGame);
  return String(sport) === "football" ? "soccer" : "mlb";
}

/**
 * @param {object} leg
 * @param {object} src
 */
function buildSourceFromDto(leg, src) {
  const homeOdds = Number(src.HomeOdds) || 0;
  const awayOdds = Number(src.AwayOdds) || 0;
  const locked = String(src.Status || "").toLowerCase() === "locked"
    || !(homeOdds > 0 && awayOdds > 0);
  return {
    Type: String(src.Type || leg.venue),
    BetID: String(src.BetID || leg.sourceMatchId),
    HomeID: String(src.HomeID || ""),
    AwayID: String(src.AwayID || ""),
    HomeOdds: homeOdds,
    AwayOdds: awayOdds,
    Status: locked ? "Locked" : "Normal",
  };
}

function orientSource(anchorHome, anchorAway, candHome, candAway, src, gameCode) {
  const ah = sportTeams.resolveKey(anchorHome, gameCode);
  const ch = sportTeams.resolveKey(candHome, gameCode);
  const ca = sportTeams.resolveKey(candAway, gameCode);
  if (ah && ch && ah === ch)
    return src;
  if (ah && ca && ah === ca) {
    return {
      ...src,
      HomeID: src.AwayID,
      AwayID: src.HomeID,
      HomeOdds: src.AwayOdds,
      AwayOdds: src.HomeOdds,
    };
  }
  return src;
}

/**
 * @param {object[]} list
 */
function extractLegs(list) {
  /** @type {object[]} */
  const legs = [];
  for (const m of list || []) {
    for (const bet of m?.Bets || []) {
      for (const [key, src] of Object.entries(bet.Sources || {})) {
        if (!src)
          continue;
        const venue = String(src.Type || key);
        const sourceMatchId = String(
          m.Matchs?.[venue] ?? m.Matchs?.[key] ?? src.BetID ?? m.ID ?? "",
        );
        if (!sourceMatchId)
          continue;
        legs.push({
          venue,
          sourceMatchId,
          home: String(bet.HomeName || ""),
          away: String(bet.AwayName || ""),
          startTime: m.StartTime != null ? Number(m.StartTime) : 0,
          game: m.Game != null ? String(m.Game) : null,
          src,
        });
      }
    }
  }
  return legs;
}

/**
 * @param {string} sport
 * @param {object[]} list
 */
export function mergeSportClientMatchDtoList(sport, list) {
  const sportKey = String(sport);
  const legs = extractLegs(list);
  /** @type {Map<string, object[]>} */
  const groups = new Map();
  const singletons = [];

  for (const leg of legs) {
    const game = gameCodeForSport(sportKey, leg.game);
    const key = sportTeams.pairKey(leg.home, leg.away, leg.startTime, game);
    if (!key) {
      singletons.push(leg);
      continue;
    }
    if (!groups.has(key))
      groups.set(key, []);
    groups.get(key).push(leg);
  }

  const builtAt = Date.now();
  const dtos = [];
  const dbRows = [];
  const linkUpdates = [];
  let multiVenueCount = 0;

  function emitGroup(pairKey, groupLegs) {
    const byVenue = new Map();
    for (const leg of groupLegs) {
      if (!byVenue.has(leg.venue))
        byVenue.set(leg.venue, leg);
    }
    const ordered = [];
    for (const v of VENUE_PRIORITY) {
      if (byVenue.has(v))
        ordered.push(byVenue.get(v));
    }
    for (const [v, leg] of byVenue) {
      if (!VENUE_PRIORITY.includes(v))
        ordered.push(leg);
    }
    if (!ordered.length)
      return;

    if (byVenue.size > 1)
      multiVenueCount += 1;

    const anchor = ordered[0];
    const game = gameCodeForSport(sportKey, anchor.game);
    const mergeKey = pairKey
      ? `${sportKey}|${pairKey}`
      : `${sportKey}|solo|${anchor.venue}|${anchor.sourceMatchId}`;
    const id = sportMergedMatchId(sportKey, mergeKey);
    const matchs = {};
    const sources = {};
    for (const leg of ordered) {
      matchs[leg.venue] = leg.sourceMatchId;
      let src = buildSourceFromDto(leg, leg.src);
      src = orientSource(anchor.home, anchor.away, leg.home, leg.away, src, game);
      sources[leg.venue] = src;
      linkUpdates.push({
        sport: sportKey,
        venue: leg.venue,
        source_match_id: leg.sourceMatchId,
        match_id: id,
      });
    }

    const startTime = ordered
      .map(l => Number(l.startTime) || 0)
      .filter(n => n > 0)
      .sort((a, b) => a - b)[0] || Number(anchor.startTime) || 0;
    const title = `${anchor.home} vs ${anchor.away}`;
    const bets = [{
      ID: id * 10 + 1,
      MatchID: id,
      Map: 0,
      Name: "Moneyline",
      HomeID: id * 10 + 11,
      HomeName: anchor.home,
      AwayID: id * 10 + 12,
      AwayName: anchor.away,
      Sources: sources,
    }];

    dtos.push({
      ID: id,
      Title: title,
      Game: game,
      GameID: 0,
      StartTime: startTime,
      Matchs: matchs,
      Bets: bets,
    });
    dbRows.push({
      id,
      sport: sportKey,
      merge_key: mergeKey,
      title,
      game,
      game_id: null,
      start_time: startTime,
      bo: null,
      round: 0,
      round_start: 0,
      matchs,
      bets,
      reverse: [],
      built_at: builtAt,
      home_gb_team_id: null,
      away_gb_team_id: null,
    });
  }

  for (const [pairKey, groupLegs] of groups)
    emitGroup(pairKey, groupLegs);
  for (const leg of singletons)
    emitGroup(null, [leg]);

  dtos.sort((a, b) => (Number(a.StartTime) || 0) - (Number(b.StartTime) || 0));
  return { dtos, dbRows, linkUpdates, multiVenueCount };
}

/**
 * @param {string} sport
 * @param {object[]} list
 */
export async function ingestSportClientMatchDtos(sport, list) {
  const { matches, bets } = clientMatchDtosToSportVenueRows(sport, list);
  if (matches.length)
    await upsertSportVenueMatches(matches);
  if (bets.length)
    await upsertSportVenueBets(bets);

  /** @type {Map<string, Set<string>>} */
  const keepByVenue = new Map();
  for (const m of matches) {
    if (!keepByVenue.has(m.venue))
      keepByVenue.set(m.venue, new Set());
    keepByVenue.get(m.venue).add(m.source_match_id);
  }
  for (const [venue, keep] of keepByVenue) {
    await pruneSportVenueSnapshot(sport, venue, [...keep]);
  }
  return { matchCount: matches.length, betCount: bets.length };
}

/**
 * @param {string} sport
 * @param {object[]} dbRows
 * @param {object[]} linkUpdates
 */
export async function persistSportMergeResult(sport, dbRows, linkUpdates) {
  await replaceSportClientMatches(String(sport), dbRows);
  for (const u of linkUpdates) {
    try {
      await setSportVenueMatchId(u.sport, u.venue, u.source_match_id, u.match_id);
    }
    catch (err) {
      console.warn("[sportMerge] setSportVenueMatchId", err?.message || err);
    }
  }
}

function persistSportInBackground(sport, list, dbRows, linkUpdates) {
  setImmediate(() => {
    void (async () => {
      try {
        await ingestSportClientMatchDtos(sport, list);
        if (dbRows.length)
          await persistSportMergeResult(sport, dbRows, linkUpdates);
      }
      catch (err) {
        console.warn(`[sportMerge] async persist ${sport}`, err?.message || err);
      }
    })();
  });
}

/**
 * API：同步内存合并；落库异步（不阻塞 Get*Matchs）。
 * @param {string} sport
 * @param {object[]} list
 * @returns {Promise<object[]|null>}
 */
export async function ingestAndMergeSportLists(sport, list) {
  const { dtos, dbRows, linkUpdates, multiVenueCount } = mergeSportClientMatchDtoList(sport, list);
  persistSportInBackground(sport, list, dbRows, linkUpdates);
  if (multiVenueCount > 0 && dtos.length)
    return dtos;
  return null;
}
