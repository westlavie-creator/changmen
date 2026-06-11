"use strict";

const { formatTitle, isPlaceholderTeamName } = require("./match_utils");

/** 平台优先级：数值越大，队名 / Title 越优先采用 */
const PROVIDER_PRIORITY = { OB: 10, RAY: 9, PB: 8, TF: 7, IA: 6, IMT: 5, IM: 4, SABA: 3, HG: 2 };

function providerPriority(platform) {
  return PROVIDER_PRIORITY[String(platform || "").trim()] || 0;
}

function sortByProviderPriority(rows, platformKey = "platform") {
  return [...(rows || [])].sort(
    (a, b) => providerPriority(b[platformKey]) - providerPriority(a[platformKey]),
  );
}

/** 从带 platform/home/away 的行中取最高优先级平台 */
function pickCanonicalPlatformRow(rows, platformKey = "platform") {
  const sorted = sortByProviderPriority(rows, platformKey);
  for (const row of sorted) {
    const home = String(row.home ?? row.Home ?? "").trim();
    const away = String(row.away ?? row.Away ?? "").trim();
    if (isPlaceholderTeamName(home) && isPlaceholderTeamName(away)) continue;
    return { ...row, home, away, platform: row[platformKey] ?? row.platform };
  }
  return null;
}

function titleFromPlatformRow(row) {
  if (!row) return null;
  const home = String(row.home ?? row.Home ?? "").trim();
  const away = String(row.away ?? row.Away ?? "").trim();
  if (isPlaceholderTeamName(home) && isPlaceholderTeamName(away)) return null;
  return formatTitle(home, away);
}

function resolveCanonicalSideNames(rows, resolvers) {
  if (!resolvers?.lookupGbTeamId || !resolvers?.lookupCanonicalName) return null;

  const sorted = sortByProviderPriority(rows);
  let home = null;
  let away = null;

  for (const row of sorted) {
    const platform = row.platform ?? row.Platform;
    const homeId = String(row.homeId ?? row.HomeID ?? "").trim();
    if (!home && homeId) {
      const gbTeamId = resolvers.lookupGbTeamId(platform, homeId);
      if (gbTeamId) {
        const name = String(resolvers.lookupCanonicalName(gbTeamId) || "").trim();
        if (name && !isPlaceholderTeamName(name)) home = name;
      }
    }
    const awayId = String(row.awayId ?? row.AwayID ?? "").trim();
    if (!away && awayId) {
      const gbTeamId = resolvers.lookupGbTeamId(platform, awayId);
      if (gbTeamId) {
        const name = String(resolvers.lookupCanonicalName(gbTeamId) || "").trim();
        if (name && !isPlaceholderTeamName(name)) away = name;
      }
    }
    if (home && away) break;
  }

  if (!home || !away) return null;
  const picked = pickCanonicalPlatformRow(rows);
  return {
    platform: picked?.platform ?? sorted[0]?.platform,
    home,
    away,
    title: formatTitle(home, away),
    canonical: true,
  };
}

function teamsFromPlatformRows(rows, resolvers) {
  const canonical = resolveCanonicalSideNames(rows, resolvers);
  if (canonical) return canonical;

  const picked = pickCanonicalPlatformRow(rows);
  if (!picked) return null;
  return {
    platform: picked.platform,
    home: picked.home,
    away: picked.away,
    title: formatTitle(picked.home, picked.away),
  };
}

module.exports = {
  PROVIDER_PRIORITY,
  providerPriority,
  sortByProviderPriority,
  pickCanonicalPlatformRow,
  titleFromPlatformRow,
  teamsFromPlatformRows,
  resolveCanonicalSideNames,
};
