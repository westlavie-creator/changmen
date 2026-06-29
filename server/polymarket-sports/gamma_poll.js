/**
 * 已关联 PM 场：Gamma REST 轮询（电竞常不在 Sports WS 推送里）
 */

import { fetchLinkedPolymarketPlatformMatches } from "@changmen/db";
import { fetchGammaEventById, gammaEventToSportMessage } from "./gamma_map.js";
import { buildPmSportSnapshot } from "./parse_sport.js";
import {
  getLastWrittenSportState,
  getPrevSportState,
  setLastWrittenSportState,
  setPrevSportState,
  shouldWritePmSport,
} from "./sport_state.js";

/** @param {number} clientMatchId @param {object} msg @param {(id:number,snap:object)=>Promise<boolean>} write */
export async function applyPmSportFromMessage(clientMatchId, msg, write) {
  const gameId = msg?.gameId != null ? Number(msg.gameId) : null;
  const stateKey = Number.isFinite(gameId) ? gameId : clientMatchId;

  const prev = getPrevSportState(stateKey);
  const snapshot = buildPmSportSnapshot(msg, prev);
  setPrevSportState(stateKey, snapshot);

  const lastWritten = getLastWrittenSportState(stateKey);
  if (!shouldWritePmSport(snapshot, lastWritten))
    return false;

  const ok = await write(clientMatchId, snapshot);
  if (ok)
    setLastWrittenSportState(stateKey, snapshot);
  return ok;
}

export async function pollLinkedPmSportFromGamma(write) {
  const linked = await fetchLinkedPolymarketPlatformMatches();
  if (!linked.length)
    return 0;

  let written = 0;
  for (const row of linked) {
    const event = await fetchGammaEventById(row.source_match_id);
    if (!event)
      continue;
    const msg = gammaEventToSportMessage(event, { home: row.home, away: row.away });
    if (!msg)
      continue;
    const ok = await applyPmSportFromMessage(row.match_id, msg, write);
    if (ok) {
      written += 1;
      console.log(
        `[pm-sports] poll cm=${row.match_id} event=${row.source_match_id} ${msg.score || ""} ${msg.period || ""}`,
      );
    }
  }
  return written;
}
