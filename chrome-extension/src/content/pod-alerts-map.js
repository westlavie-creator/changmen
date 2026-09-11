/**
 * POD terminal AG Grid 行 → 冻结告警 DTO。无 Chrome API，可单测。
 */

function str(v) {
  return String(v ?? "").trim();
}

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function optNum(v) {
  if (v == null || v === "")
    return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {Record<string, unknown>} row
 * @returns {Record<string, unknown> | null}
 */
export function mapPodAlert(row) {
  if (!row || typeof row !== "object")
    return null;
  const info = row.alertInfo && typeof row.alertInfo === "object" ? row.alertInfo : {};
  const id = str(row.alertId || row.id);
  if (!id)
    return null;
  const home = str(row.homeTeam || row.home);
  const away = str(row.awayTeam || row.away);
  const lineType = str(row.lineType);
  return {
    id,
    eventId: str(row.ext_event_id || row.eventId),
    sport: str(info.nickname || row.nickname),
    sportId: num(row.sportId),
    league: str(row.leagueName),
    home,
    away,
    starts: num(row.starts),
    alertedAt: num(info.alertedAt || row.timestamp || row.alertedAt),
    market: str(row.market || lineType),
    lineType,
    period: num(row.period ?? row.periodNumber),
    outcome: str(row.rowOutcome || row.outcome),
    points: optNum(row.points),
    previous: num(row.previous ?? row.changeFrom),
    current: num(row.current ?? row.changeTo),
    nvp: num(row.noVigPrice),
    dropPct: num(row.percentageChange),
    ways: optNum(row.moneylineNumberOfWays),
  };
}

/**
 * @param {unknown} rows
 * @returns {{ alerts: Record<string, unknown>[]; fingerprint: string }}
 */
export function mapPodAlertRows(rows) {
  if (!Array.isArray(rows))
    return { alerts: [], fingerprint: "" };
  const alerts = [];
  for (const row of rows) {
    const mapped = mapPodAlert(/** @type {Record<string, unknown>} */ (row));
    if (mapped)
      alerts.push(mapped);
  }
  alerts.sort((a, b) => Number(b.alertedAt) - Number(a.alertedAt) || String(a.id).localeCompare(String(b.id)));
  const fingerprint = alerts.map((a) => `${a.id}:${a.current}:${a.nvp}:${a.dropPct}`).join("|");
  return { alerts, fingerprint };
}
