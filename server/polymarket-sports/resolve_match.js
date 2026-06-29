import { resolveClientMatchIdForPmSport } from "@changmen/db";
import {
  fetchGammaEventByGameId,
  fetchGammaEventBySlug,
  rememberGammaEvent,
} from "./gamma_map.js";

/** @param {{ id?: string, slug?: string, gameId?: number | null }} row @param {number | null} gameId */
async function resolveFromGammaEventRow(row, gameId) {
  if (!row?.id && !row?.slug)
    return null;

  const hit = await resolveClientMatchIdForPmSport({
    eventId: row.id,
    slug: row.slug,
    gameId: row.gameId ?? gameId,
  });
  if (hit)
    return hit;

  if (row.slug) {
    const bySlug = await resolveClientMatchIdForPmSport({ slug: row.slug });
    if (bySlug)
      return bySlug;
  }

  if (row.id) {
    const byId = await resolveClientMatchIdForPmSport({ eventId: row.id, gameId });
    if (byId)
      return byId;
  }

  return null;
}

/** @param {number | null} gameId @param {{ byGameId: Map<number, object>, bySlug: Map<string, object> }} gammaIndex */
async function resolveGammaRowForGameId(gameId, gammaIndex) {
  if (!Number.isFinite(gameId))
    return null;

  if (gammaIndex?.byGameId?.has(gameId))
    return gammaIndex.byGameId.get(gameId);

  const row = await fetchGammaEventByGameId(gameId);
  if (row)
    rememberGammaEvent(gammaIndex, row);
  return row;
}

/**
 * @param {object} msg Sports WS message
 * @param {{ byGameId: Map<number, { id: string, slug: string }>, bySlug: Map<string, { id: string, slug: string, gameId: number | null }> }} gammaIndex
 */
export async function resolveClientMatchIdFromSportMessage(msg, gammaIndex) {
  const slug = msg?.slug ? String(msg.slug) : "";
  const gameId = msg?.gameId != null ? Number(msg.gameId) : null;

  if (slug) {
    const hit = await resolveClientMatchIdForPmSport({ slug });
    if (hit)
      return hit;
  }

  if (Number.isFinite(gameId)) {
    const row = await resolveGammaRowForGameId(gameId, gammaIndex);
    if (row) {
      const hit = await resolveFromGammaEventRow(row, gameId);
      if (hit)
        return hit;
    }
  }

  if (slug && gammaIndex?.bySlug?.has(slug)) {
    const row = gammaIndex.bySlug.get(slug);
    const hit = await resolveFromGammaEventRow(row, gameId);
    if (hit)
      return hit;
  }

  if (slug) {
    const row = await fetchGammaEventBySlug(slug);
    if (row) {
      rememberGammaEvent(gammaIndex, row);
      const hit = await resolveFromGammaEventRow(row, gameId);
      if (hit)
        return hit;
    }
  }

  return null;
}
