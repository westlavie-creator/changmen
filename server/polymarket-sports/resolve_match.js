import { resolveClientMatchIdForPmSport } from "@changmen/db";
import { fetchGammaEventBySlug } from "./gamma_map.js";

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

  let eventId = "";
  if (Number.isFinite(gameId) && gammaIndex?.byGameId?.has(gameId)) {
    const row = gammaIndex.byGameId.get(gameId);
    eventId = row?.id || "";
    if (row?.slug) {
      const bySlug = await resolveClientMatchIdForPmSport({ slug: row.slug });
      if (bySlug)
        return bySlug;
    }
  }

  if (eventId) {
    const hit = await resolveClientMatchIdForPmSport({ eventId, gameId });
    if (hit)
      return hit;
  }

  if (slug && gammaIndex?.bySlug?.has(slug)) {
    const row = gammaIndex.bySlug.get(slug);
    if (row?.id) {
      const hit = await resolveClientMatchIdForPmSport({ eventId: row.id, slug: row.slug, gameId });
      if (hit)
        return hit;
    }
  }

  if (slug) {
    const row = await fetchGammaEventBySlug(slug);
    if (row?.id) {
      const hit = await resolveClientMatchIdForPmSport({
        eventId: row.id,
        slug: row.slug || slug,
        gameId: row.gameId ?? gameId,
      });
      if (hit)
        return hit;
    }
  }

  return null;
}
