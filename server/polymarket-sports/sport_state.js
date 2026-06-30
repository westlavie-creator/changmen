/**
 * 进程内：按 Sports WS gameId 保留上一帧
 */

/** @type {Map<number, object>} */
const prevByGameId = new Map();
/** @type {Map<number, object>} */
const lastWrittenByGameId = new Map();

export function getPrevSportState(gameId) {
  const id = Number(gameId);
  if (!Number.isFinite(id))
    return null;
  return prevByGameId.get(id) || null;
}

export function setPrevSportState(gameId, snapshot) {
  const id = Number(gameId);
  if (!Number.isFinite(id) || !snapshot)
    return;
  prevByGameId.set(id, snapshot);
}

export function getLastWrittenSportState(gameId) {
  const id = Number(gameId);
  if (!Number.isFinite(id))
    return null;
  return lastWrittenByGameId.get(id) || null;
}

export function setLastWrittenSportState(gameId, snapshot) {
  const id = Number(gameId);
  if (!Number.isFinite(id) || !snapshot)
    return;
  lastWrittenByGameId.set(id, snapshot);
}

/** @param {object} next @param {object | null} prevWritten */
export function shouldWritePmSport(next, prevWritten) {
  if (!next)
    return false;
  if (!prevWritten)
    return true;
  const keys = [
    "status", "live", "ended", "period", "scoreRaw", "label",
    "finishedTimestamp", "currentMap", "elapsed", "resolutionSource",
  ];
  for (const key of keys) {
    if (next[key] !== prevWritten[key])
      return true;
  }
  const nh = next.mapScore?.home ?? 0;
  const na = next.mapScore?.away ?? 0;
  const ph = prevWritten.mapScore?.home ?? 0;
  const pa = prevWritten.mapScore?.away ?? 0;
  if (nh !== ph || na !== pa)
    return true;
  return false;
}
