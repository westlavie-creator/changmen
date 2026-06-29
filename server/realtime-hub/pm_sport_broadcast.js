import { fetchClientMatchRow } from "@changmen/db";
import { alignPmSportSnapshot } from "@changmen/polymarket-sports/parse_sport.js";
import { PM_SPORT_CHANNEL } from "./channels.js";

const PM_PLATFORM = "Polymarket";

/**
 * @param {object | null | undefined} row
 * @returns {boolean}
 */
function reverseIncludesPolymarket(row) {
  const rev = row?.reverse ?? row?.Reverse;
  return Array.isArray(rev) && rev.map(String).includes(PM_PLATFORM);
}

/**
 * @param {number} clientMatchId
 * @param {object} pmSport PM 原生快照
 * @returns {Promise<object | null>} Title 对齐后的 payload
 */
export async function buildPmSportPushPayload(clientMatchId, pmSport) {
  const id = Number(clientMatchId);
  if (!Number.isFinite(id) || !pmSport || typeof pmSport !== "object")
    return null;

  const row = await fetchClientMatchRow(id, "id, reverse, matchs");
  if (!row)
    return null;

  const matchs = row.matchs || {};
  if (!Object.hasOwn(matchs, PM_PLATFORM))
    return null;

  const aligned = reverseIncludesPolymarket(row)
    ? alignPmSportSnapshot(pmSport, true)
    : pmSport;

  return {
    ClientMatchID: id,
    PmSport: aligned,
  };
}

/**
 * @param {(channel: string, message: unknown) => void} emit
 * @param {number} clientMatchId
 * @param {object} pmSport
 */
export async function broadcastPmSportUpdate(emit, clientMatchId, pmSport) {
  const payload = await buildPmSportPushPayload(clientMatchId, pmSport);
  if (!payload)
    return false;
  emit(PM_SPORT_CHANNEL, payload);
  return true;
}
