import { isPlatformMatchRowFullyIdMapped } from "@changmen/db";
import { classifyMergeBasis, PROVIDER_PRIORITY, setTeamPlugin } from "@changmen/match-engine";
import { resolvePlatformTeamId } from "@changmen/shared/catalog/pb_team_platform_id";

let _pluginPromise = null;

export function resetMatcherUiTeamPlugin() {
  _pluginPromise = null;
}

export function getTeamPlugin() {
  if (!_pluginPromise) {
    _pluginPromise = (async () => {
      try {
        const { loadAndCreatePlugin } = await import("@changmen/team-resolver/team_db.js");
        const plugin = await loadAndCreatePlugin();
        setTeamPlugin(plugin);
        return plugin;
      }
      catch (err) {
        console.warn("[matcher] team-resolver unavailable:", err.message);
        setTeamPlugin(null);
        return null;
      }
    })();
  }
  return _pluginPromise;
}

function linkedPlatformRows(cm, byPlatform) {
  const rows = [];
  for (const [plat, srcId] of Object.entries(cm.matchs || {})) {
    const row = (byPlatform[plat] || []).find(m => String(m.source_match_id) === String(srcId));
    if (row)
      rows.push(row);
  }
  return rows;
}

function classifyViaPlugin(rows) {
  return rows.map(row =>
    classifyMergeBasis(String(row.home || ""), String(row.away || ""), row.game?.code, {
      provider: row.platform,
      homeId: resolvePlatformTeamId(
        row.platform,
        row.home_id,
        row.source_game_id,
        row.game?.code,
      ),
      awayId: resolvePlatformTeamId(
        row.platform,
        row.away_id,
        row.source_game_id,
        row.game?.code,
      ),
    }),
  );
}

export function classifyClientMatchMergeMode(cm, byPlatform, teamMaps = null) {
  const rows = linkedPlatformRows(cm, byPlatform);
  if (!rows.length)
    return { mode: "unknown", label: "未知" };

  const mode = teamMaps
    ? rows.every(row => isPlatformMatchRowFullyIdMapped(row, teamMaps))
      ? "id"
      : "name"
    : classifyViaPlugin(rows).every(m => m === "id")
      ? "id"
      : "name";

  const refPlat = [...rows].sort(
    (a, b) => (PROVIDER_PRIORITY[b.platform] || 0) - (PROVIDER_PRIORITY[a.platform] || 0),
  )[0].platform;

  return {
    mode,
    label: mode === "id" ? "平台 ID" : "队名",
    platforms: rows.length,
    refPlat,
  };
}

export async function enrichClientMatchesMergeMode(clientMatches, byPlatform, teamMaps = null) {
  if (!teamMaps)
    await getTeamPlugin();
  return (clientMatches || []).map(cm => ({
    ...cm,
    merge_mode: classifyClientMatchMergeMode(cm, byPlatform, teamMaps),
  }));
}
