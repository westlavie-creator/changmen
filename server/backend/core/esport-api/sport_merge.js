/**
 * N3 sport moneyline 合并：当次列表内存合并（API）+ 可选落库。
 * 禁止触碰电竞 client_matches / platform_* / team_db。
 */
import {
  pruneSportVenueSnapshot,
  replaceSportClientMatches,
  setSportVenueMatchId,
  upsertSportVenueBets,
  upsertSportVenueMatches,
} from "@changmen/db";
import {
  clientMatchDtosToSportVenueRows,
  sportMergedMatchId,
  sportPairKey,
  normTeamName,
} from "./sport_venue_ingest.js";

const VENUE_PRIORITY = ["Polymarket", "PredictFun"];

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

function orientSource(anchorHome, anchorAway, candHome, candAway, src) {
  const ah = normTeamName(anchorHome);
  const ch = normTeamName(candHome);
  const ca = normTeamName(candAway);
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
 * 从当次 ClientMatchDto[] 抽出可合并腿（不读 DB，避免陈旧行污染）。
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
          raw: m,
        });
      }
    }
  }
  return legs;
}

/**
 * 仅基于当次列表的 moneyline 合并（API 真源）。
 * @param {string} sport
 * @param {object[]} list
 * @returns {{ dtos: object[], dbRows: object[], linkUpdates: object[], multiVenueCount: number }}
 */
export function mergeSportClientMatchDtoList(sport, list) {
  const sportKey = String(sport);
  const legs = extractLegs(list);
  /** @type {Map<string, object[]>} */
  const groups = new Map();
  /** 无法配对时间的腿 → 各自保留为单源（用稳定 singleton key） */
  const singletons = [];

  for (const leg of legs) {
    const key = sportPairKey(leg.home, leg.away, leg.startTime);
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
    const mergeKey = pairKey
      ? `${sportKey}|${pairKey}`
      : `${sportKey}|solo|${anchor.venue}|${anchor.sourceMatchId}`;
    const id = sportMergedMatchId(sportKey, mergeKey);
    const matchs = {};
    const sources = {};
    for (const leg of ordered) {
      matchs[leg.venue] = leg.sourceMatchId;
      let src = buildSourceFromDto(leg, leg.src);
      src = orientSource(anchor.home, anchor.away, leg.home, leg.away, src);
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
    const game = anchor.game || (sportKey === "football" ? "soccer" : "mlb");
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
 * 双写 venue 表 + 按本批 venue 快照裁剪；失败只打日志。
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
 * 将当次合并结果写入 sport_client_matches（不读全表做二次合并）。
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

/**
 * API 路径：内存合并当次列表；落库尽力而为。
 * 仅当存在至少一场双场馆合并时返回 merged（否则 null → 调用方用原 concat，避免无意义改 id）。
 * @param {string} sport
 * @param {object[]} list
 * @returns {Promise<object[]|null>}
 */
export async function ingestAndMergeSportLists(sport, list) {
  const { dtos, dbRows, linkUpdates, multiVenueCount } = mergeSportClientMatchDtoList(sport, list);

  try {
    await ingestSportClientMatchDtos(sport, list);
    if (dbRows.length)
      await persistSportMergeResult(sport, dbRows, linkUpdates);
  }
  catch (err) {
    console.warn(`[sportMerge] persist ${sport}`, err?.message || err);
  }

  if (multiVenueCount > 0 && dtos.length)
    return dtos;
  return null;
}
