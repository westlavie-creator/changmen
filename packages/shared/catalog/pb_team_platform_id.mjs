/**
 * PB 在 team_platform_maps.platform_id 中的格式：{teamSlug}@{SourceGameID}
 * SourceGameID 归一化为 game_catalog platforms.PB（如 dota2 → dota-2）。
 */
import { getGameCodeForPlatformId, getPlatformGameId } from "./game_catalog.mjs";

function resolvePbGameSlug(sourceGameId, gameCode) {
  const raw = String(sourceGameId ?? "").trim();
  let code = raw ? getGameCodeForPlatformId("PB", raw) : null;
  if (!code && gameCode) code = String(gameCode).trim() || null;
  if (code) {
    const slug = getPlatformGameId("PB", code);
    if (slug) return slug;
  }
  return raw;
}

function formatPbTeamPlatformId(sourceGameId, teamId, gameCode) {
  const gameId = resolvePbGameSlug(sourceGameId, gameCode);
  let pid = String(teamId ?? "").trim();
  if (!pid) return "";
  if (!gameId) return pid;

  const suffix = `@${gameId}`;
  if (pid.endsWith(suffix)) return pid;

  const oldPrefix = `${gameId}:`;
  if (pid.startsWith(oldPrefix)) pid = pid.slice(oldPrefix.length);

  const atIdx = pid.indexOf("@");
  if (atIdx > 0) pid = pid.slice(0, atIdx);

  return `${pid}@${gameId}`;
}

export { resolvePbGameSlug, formatPbTeamPlatformId };
