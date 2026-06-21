import * as sb from "@changmen/db";
import { isAdminUser, isLeaderUser, getTeamId } from "./admin_auth.js";

function resolveVisibleUserIds(caller, allProfiles) {
  if (!caller || isAdminUser(caller)) return null;
  const teamId = getTeamId(caller);
  if (isLeaderUser(caller) && teamId) {
    return new Set((allProfiles || []).filter((p) => p.team_id === teamId).map((p) => String(p.id)));
  }
  return new Set([String(caller.id)]);
}

/** 团队长权限下可见的 userId 列表（admin 返回 null = 全部可见） */
export async function getVisibleUserIds(caller) {
  if (!caller || isAdminUser(caller)) return null;
  const allProfiles = await sb.fetchProfilesAdmin();
  return resolveVisibleUserIds(caller, allProfiles);
}

export function filterProfiles(profiles, visibleIds) {
  if (!visibleIds) return profiles;
  return (profiles || []).filter((p) => visibleIds.has(String(p.id)));
}

export { resolveVisibleUserIds };
