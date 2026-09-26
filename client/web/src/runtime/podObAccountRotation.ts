export const POD_OB_ACCOUNT_ROTATION_KEY = "changmen:podObAccountRotation:lastAccountId";

export type PodObRotationAccount = {
  accountId?: number;
};

type RotationStorage = Pick<Storage, "getItem" | "setItem">;

function browserStorage(): RotationStorage | undefined {
  try {
    return typeof window !== "undefined" ? window.localStorage : undefined;
  }
  catch {
    return undefined;
  }
}

/**
 * 轮换开启时，每次实际下单尝试只返回一个账号。
 * 游标在发起请求前推进，因此某个账号下单失败后，下一笔仍会切到下一个账号。
 */
export function pickPodObAccountsForPlacement<T extends PodObRotationAccount>(
  accounts: T[],
  rotation: boolean,
  storage: RotationStorage | undefined = browserStorage(),
): T[] {
  if (!rotation || accounts.length <= 1)
    return accounts;

  let lastAccountId = 0;
  try {
    lastAccountId = Math.round(Number(storage?.getItem(POD_OB_ACCOUNT_ROTATION_KEY)) || 0);
  }
  catch { /* localStorage 不可用时从第一个账号开始 */ }

  const lastIndex = accounts.findIndex(account => Number(account.accountId) === lastAccountId);
  const nextIndex = lastIndex >= 0 ? (lastIndex + 1) % accounts.length : 0;
  const selected = accounts[nextIndex];
  const selectedId = Math.round(Number(selected?.accountId) || 0);
  if (selectedId > 0) {
    try {
      storage?.setItem(POD_OB_ACCOUNT_ROTATION_KEY, String(selectedId));
    }
    catch { /* 单笔仍可继续下单 */ }
  }
  return selected ? [selected] : [];
}
