/** 管理员判定：读 users.is_admin + role */
export function isAdminUser(profile) {
  if (!profile)
    return false;
  if (profile.role === "admin")
    return true;
  if (profile.isAdmin === true || profile.is_admin === true)
    return true;
  if (profile.isAdmin === 1 || profile.is_admin === 1)
    return true;
  return false;
}

export function isLeaderUser(profile) {
  if (!profile)
    return false;
  return profile.role === "leader";
}

export function canAccessAdminPanel(profile) {
  return isAdminUser(profile) || isLeaderUser(profile);
}

export function getTeamId(profile) {
  if (!profile)
    return null;
  return profile.teamId || profile.team_id || null;
}

export function assertAdmin(profile) {
  if (!isAdminUser(profile)) {
    const err = new Error("无管理员权限");
    err.code = "FORBIDDEN";
    throw err;
  }
}

export function assertLeaderOrAdmin(profile) {
  if (!canAccessAdminPanel(profile)) {
    const err = new Error("无管理权限");
    err.code = "FORBIDDEN";
    throw err;
  }
}
