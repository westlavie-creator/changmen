import {
  fetchExistingTeamMapKeys,
  upsertTeamPlatformMaps,
} from "@changmen/db";
import { getGameCodeForPlatformId } from "@changmen/shared/catalog/game_catalog";
import { formatPbTeamPlatformId } from "@changmen/shared/catalog/pb_team_platform_id";

/**
 * matchMerge 时自动收录指定平台尚未在 team_venue_maps 中的队伍。
 * 仅写入待识别记录（gb_team_id 为 NULL），不分配编号。
 */

const AUTO_REGISTER_PLATFORMS = new Set([
  "TF",
  "OB",
  "RAY",
  "IA",
  "PB",
  "Stake",
  "Polymarket",
  "PredictFun",
  "Limitless",
]);
const AUTO_REGISTER_PLATFORM_LABEL = [...AUTO_REGISTER_PLATFORMS].join("/");
const UPSERT_BATCH = 200;

function normalizePlatformId(id) {
  if (id == null || id === "")
    return "";
  return String(id).trim();
}

function parseTeamsArray(teams) {
  if (Array.isArray(teams))
    return teams;
  if (typeof teams === "string") {
    try {
      return JSON.parse(teams);
    }
    catch {
      return [];
    }
  }
  return [];
}

function resolveStoredPlatformTeamId(platform, platformId, sourceGameId, gameCode) {
  const pid = normalizePlatformId(platformId);
  if (!pid)
    return "";
  if (platform === "PB") {
    const gameSlug = String(sourceGameId ?? "").trim();
    const code = gameCode || getGameCodeForPlatformId("PB", gameSlug) || null;
    return formatPbTeamPlatformId(gameSlug, pid, code);
  }
  return pid;
}

function addCandidate(candidates, platform, platformId, platformName, gameCode, sourceGameId) {
  const pid = resolveStoredPlatformTeamId(platform, platformId, sourceGameId, gameCode);
  if (!pid || !gameCode || gameCode === "unknown")
    return;
  const key = `${platform}:${pid}`;
  if (candidates.has(key))
    return;
  const name = String(platformName || "").trim() || pid;
  candidates.set(key, {
    venue: String(platform),
    venue_team_id: pid,
    venue_name: name,
    game: gameCode,
    source: "auto",
    confidence: 1.0,
  });
}

/** 从 platform_matches 原始结构收集待收录队伍 */
function collectTeamCandidates(matchesRaw) {
  const candidates = new Map();

  for (const [platform, block] of Object.entries(matchesRaw || {})) {
    if (!AUTO_REGISTER_PLATFORMS.has(platform))
      continue;
    const list = Array.isArray(block) ? block : Object.values(block || {});
    for (const m of list) {
      if (!m)
        continue;
      const sourceGameId = String(m.SourceGameID ?? m.source_game_id ?? "");
      const gameCode = getGameCodeForPlatformId(platform, sourceGameId);
      if (!gameCode || gameCode === "unknown")
        continue;

      addCandidate(candidates, platform, m.HomeID ?? m.home_id, m.Home ?? m.home, gameCode, sourceGameId);
      addCandidate(candidates, platform, m.AwayID ?? m.away_id, m.Away ?? m.away, gameCode, sourceGameId);

      for (const t of parseTeamsArray(m.Teams ?? m.teams)) {
        const teamGameId = String(t.GameID ?? t.game_id ?? t.gameId ?? sourceGameId ?? "");
        addCandidate(
          candidates,
          platform,
          t.TeamID ?? t.team_id ?? t.teamId ?? t.id,
          t.Name ?? t.name ?? t.TeamName ?? t.team_name,
          gameCode,
          teamGameId,
        );
      }
    }
  }

  return candidates;
}

/**
 * @param {Record<string, unknown>} matchesRaw fetchPlatformMatches() 返回值
 * @returns {{ scanned: number, registered: number }}
 */
async function autoRegisterTeams(matchesRaw) {
  const candidates = collectTeamCandidates(matchesRaw);
  if (!candidates.size)
    return { scanned: 0, registered: 0 };

  const existing = await fetchExistingTeamMapKeys(candidates);
  const toWrite = [...candidates.values()].filter(
    row => !existing.has(`${row.venue ?? row.platform}:${row.venue_team_id}`),
  );
  if (!toWrite.length)
    return { scanned: candidates.size, registered: 0 };

  let registered = 0;
  for (let i = 0; i < toWrite.length; i += UPSERT_BATCH) {
    const batch = toWrite.slice(i, i + UPSERT_BATCH);
    await upsertTeamPlatformMaps(batch, { ignoreDuplicates: true });
    registered += batch.length;
  }

  if (registered > 0) {
    console.log(`[matcher] 自动收录 ${registered} 条平台队伍（${AUTO_REGISTER_PLATFORM_LABEL}）`);
  }

  return { scanned: candidates.size, registered };
}

export { AUTO_REGISTER_PLATFORMS, autoRegisterTeams };
