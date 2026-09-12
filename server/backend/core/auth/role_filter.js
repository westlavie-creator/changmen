import * as sb from "@changmen/db";
import { getTeamId, isAdminUser, isLeaderUser } from "./admin_auth.js";

/** 管理端报表/筛选：无 team_id 的用户 */
export const UNGROUPED_TEAM_ID = "__none__";

function profileTeamId(profile) {
  const raw = profile?.team_id ?? profile?.teamId;
  return raw != null && String(raw).trim() ? String(raw).trim() : "";
}

function resolveVisibleUserIds(caller, allProfiles) {
  if (!caller || isAdminUser(caller))
    return null;
  const teamId = getTeamId(caller);
  if (isLeaderUser(caller) && teamId) {
    const tid = String(teamId);
    return new Set(
      (allProfiles || []).filter(p => profileTeamId(p) === tid).map(p => String(p.id)),
    );
  }
  return new Set([String(caller.id)]);
}

/** 团队长权限下可见的 userId 列表（admin 返回 null = 全部可见） */
export async function getVisibleUserIds(caller) {
  if (!caller || isAdminUser(caller))
    return null;
  const allProfiles = await sb.fetchProfilesAdmin();
  return resolveVisibleUserIds(caller, allProfiles);
}

export function filterProfiles(profiles, visibleIds) {
  if (!visibleIds)
    return profiles;
  return (profiles || []).filter(p => visibleIds.has(String(p.id)));
}

/** 按团队筛 userId；teamId 为空则只套 visibleIds（admin 且无团队 = 全部） */
export function filterUserIdsByTeam(allProfiles, teamId, visibleIds) {
  const tid = String(teamId || "").trim();
  let ids = (allProfiles || [])
    .filter((p) => {
      const pTeam = profileTeamId(p);
      if (!tid)
        return true;
      if (tid === UNGROUPED_TEAM_ID)
        return !pTeam;
      return pTeam === tid;
    })
    .map(p => String(p.id));
  if (visibleIds)
    ids = ids.filter(id => visibleIds.has(id));
  return ids;
}

/**
 * 管理端月报范围：单用户优先；否则按团队（或团队长可见集）。
 * userIds: [] 表示团队无成员（不是全站）。
 */
export function resolveAdminMonthReportScope(caller, query, allProfiles) {
  const visibleIds = resolveVisibleUserIds(caller, allProfiles);
  const uid = query?.userId != null && String(query.userId).trim()
    ? String(query.userId).trim()
    : "";
  const tid = query?.teamId != null && String(query.teamId).trim()
    ? String(query.teamId).trim()
    : "";

  if (visibleIds && uid && !visibleIds.has(uid))
    return { error: "无权查看该用户的报表" };

  if (visibleIds && tid) {
    const callerTeam = String(getTeamId(caller) || "");
    if (tid === UNGROUPED_TEAM_ID || tid !== callerTeam)
      return { error: "无权查看该团队的报表" };
  }

  if (tid) {
    const members = filterUserIdsByTeam(allProfiles, tid, visibleIds);
    if (uid && !members.includes(uid))
      return { error: "该用户不属于所选团队" };
    if (uid)
      return { userId: uid };
    return { userIds: members };
  }

  if (uid)
    return { userId: uid };
  if (visibleIds)
    return { userIds: [...visibleIds] };
  return {};
}

export async function getAdminMonthReportScope(caller, query) {
  const allProfiles = await sb.fetchProfilesAdmin();
  return resolveAdminMonthReportScope(caller, query, allProfiles);
}

export { resolveVisibleUserIds };
