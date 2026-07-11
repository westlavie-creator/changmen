/** Polymarket /sports 中足球联赛 tag（非电竞/NBA/NFL 等） */
export const SOCCER_TAG = "100350";

const LEAGUE_LABELS = {
  epl: "Premier League",
  lal: "La Liga",
  bun: "Bundesliga",
  sea: "Serie A",
  fl1: "Ligue 1",
  ucl: "Champions League",
  uel: "Europa League",
  col: "Conference League",
  mls: "MLS",
  ere: "Eredivisie",
  por: "Liga Portugal",
  tur: "Süper Lig",
  mex: "Liga MX",
  bra: "Brasileirão",
  arg: "Liga Profesional",
  fifwc: "World Cup",
  efl: "EFL Championship",
  elc: "Championship",
};

/**
 * @param {unknown} data
 * @returns {Array<Record<string, unknown>>}
 */
export function unwrapSportsRows(data) {
  if (Array.isArray(data))
    return data;
  if (data && typeof data === "object") {
    if (Array.isArray(data.data))
      return data.data;
  }
  return [];
}

/**
 * @param {Record<string, unknown>} row
 */
export function isSoccerSportRow(row) {
  if (!row || typeof row !== "object")
    return false;
  const tags = String(row.tags ?? "");
  if (!tags.split(",").map(t => t.trim()).includes(SOCCER_TAG))
    return false;
  const sport = String(row.sport ?? "").trim().toLowerCase();
  if (!sport)
    return false;
  return true;
}

/**
 * @param {Record<string, unknown>} row
 */
export function leagueFromSportRow(row) {
  const sport = String(row.sport ?? "").trim().toLowerCase();
  const series = String(row.series ?? "").trim();
  const label = LEAGUE_LABELS[sport] || sport.toUpperCase();
  return {
    sport,
    name: label,
    series,
    image: row.image ? String(row.image) : "",
    resolution: row.resolution ? String(row.resolution) : "",
  };
}

/**
 * @param {Array<Record<string, unknown>>} rows
 */
export function filterSoccerLeagues(rows) {
  const leagues = [];
  const seen = new Set();
  for (const row of rows) {
    if (!isSoccerSportRow(row))
      continue;
    const league = leagueFromSportRow(row);
    if (!league.series || seen.has(league.series))
      continue;
    seen.add(league.series);
    leagues.push(league);
  }
  leagues.sort((a, b) => a.name.localeCompare(b.name));
  return leagues;
}
