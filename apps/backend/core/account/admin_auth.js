/** 管理员用户名白名单（逗号分隔，不区分大小写） */
export function isAdminUser(profile) {
  const name = String(profile?.userName || profile?.user_name || "").trim().toLowerCase();
  if (!name) return false;
  const raw = process.env.ADMIN_USERNAMES || "admin";
  const allowed = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(name);
}

export function assertAdmin(profile) {
  if (!isAdminUser(profile)) {
    const err = new Error("无管理员权限");
    err.code = "FORBIDDEN";
    throw err;
  }
}
