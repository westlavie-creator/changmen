import { setTeamPlugin, classifyMergeBasis, PROVIDER_PRIORITY } from "../../../packages/match-engine/index.js";

let _pluginPromise = null;

export function getTeamPlugin() {
  if (!_pluginPromise) {
    _pluginPromise = (async () => {
      try {
        const { loadAndCreatePlugin } = await import("../../../packages/team-resolver/supabase_db.js");
        const plugin = await loadAndCreatePlugin();
        setTeamPlugin(plugin);
        return plugin;
      } catch (err) {
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
    const row = (byPlatform[plat] || []).find((m) => String(m.source_match_id) === String(srcId));
    if (row) rows.push(row);
  }
  return rows;
}

export function classifyClientMatchMergeMode(cm, byPlatform) {
  const rows = linkedPlatformRows(cm, byPlatform);
  if (!rows.length) return { mode: "unknown", label: "未知" };

  const modes = rows.map((row) =>
    classifyMergeBasis(String(row.home || ""), String(row.away || ""), row.game?.code, {
      provider: row.platform,
      homeId: String(row.home_id || ""),
      awayId: String(row.away_id || ""),
    }),
  );

  const mode = modes.every((m) => m === "id") ? "id" : "name";
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

export async function enrichClientMatchesMergeMode(clientMatches, byPlatform) {
  await getTeamPlugin();
  return (clientMatches || []).map((cm) => ({
    ...cm,
    merge_mode: classifyClientMatchMergeMode(cm, byPlatform),
  }));
}
