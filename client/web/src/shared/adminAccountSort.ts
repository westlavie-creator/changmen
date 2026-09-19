export interface AdminAccountSortKey {
  userName: string;
  provider: string;
  playerName: string;
  playerId: number;
}

/** 管理端订单「按操盘账号」分列的统一排序：用户 → 平台 → 账号名（zh-CN）→ playerId（数值） */
export function compareAdminAccountKeys(a: AdminAccountSortKey, b: AdminAccountSortKey): number {
  return a.userName.localeCompare(b.userName, "zh-CN")
    || a.provider.localeCompare(b.provider)
    || a.playerName.localeCompare(b.playerName, "zh-CN")
    || a.playerId - b.playerId;
}
