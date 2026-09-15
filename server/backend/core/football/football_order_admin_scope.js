/**
 * Client_AdminFootballOrders 可见集：与电竞 listAdminOrders 同权。
 * 纯函数，不读数据库。
 */
import { getTeamId, isAdminUser, isLeaderUser } from "../auth/admin_auth.js";

function profileTeamId(profile) {
  const raw = profile?.team_id ?? profile?.teamId;
  return raw != null && String(raw).trim() ? String(raw).trim() : "";
}

/** admin 全站；leader 仅本队；其它仅本人 */
function visibleUserIds(caller, allProfiles) {
  if (!caller || isAdminUser(caller))
    return null;
  const teamId = getTeamId(caller);
  if (isLeaderUser(caller) && teamId) {
    const tid = String(teamId);
    return new Set(
      (allProfiles || [])
        .filter(p => profileTeamId(p) === tid)
        .map(p => String(p.id)),
    );
  }
  return new Set([String(caller.id)]);
}

/**
 * @param {{ id?: string, role?: string, team_id?: string, teamId?: string } | null} caller
 * @param {Record<string, unknown>} [body]
 * @param {Array<{ id?: string, team_id?: string, teamId?: string }>} [allProfiles]
 * @returns {{ denied: boolean, userId: string, userIds: string[] | undefined }}
 */
export function resolveAdminFootballOrdersScope(caller, body = {}, allProfiles = []) {
  const userId = String(body.userId || "").trim();
  if (caller && !isAdminUser(caller)) {
    const ids = visibleUserIds(caller, allProfiles);
    if (ids) {
      if (userId && !ids.has(userId))
        return { denied: true, userId: "", userIds: undefined };
      if (userId)
        return { denied: false, userId, userIds: undefined };
      return { denied: false, userId: "", userIds: [...ids] };
    }
  }
  return { denied: false, userId, userIds: undefined };
}
