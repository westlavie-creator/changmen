// 权限判定已移至 core/auth/admin_auth.js，此文件保持兼容 re-export
export {
  assertAdmin,
  assertLeaderOrAdmin,
  canAccessAdminPanel,
  getTeamId,
  isAdminUser,
  isLeaderUser,
} from "../auth/admin_auth.js";
