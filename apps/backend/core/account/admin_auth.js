/** 管理员判定：读 users.is_admin（经 profile 缓存/查询带入 isAdmin） */
export function isAdminUser(profile) {
  if (!profile) return false;
  if (profile.isAdmin === true || profile.is_admin === true) return true;
  if (profile.isAdmin === 1 || profile.is_admin === 1) return true;
  return false;
}

export function assertAdmin(profile) {
  if (!isAdminUser(profile)) {
    const err = new Error("无管理员权限");
    err.code = "FORBIDDEN";
    throw err;
  }
}
