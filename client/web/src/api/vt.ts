import type { UpdateBalanceResult } from "@/types/account";
/**
 * A8 bundle `Vt` 门面：Client_GetData / Client_SaveData / Client_UpdateBalance。
 * 账号 KV 键 HF = "ACCOUNT"（Io store loadAccounts / saveAccounts）。
 */
import { post } from "@/api/client";
import { getClientDataArray } from "@/api/kv";

/** [A8 可证实] const HF = "ACCOUNT" */
export const ACCOUNT_KEY = "ACCOUNT";

/** 对齐 A8 `Vt.getData(key)`：ACCOUNT 等数组 KV 直接返回数组 */
export async function getData<T>(key: string): Promise<T | null> {
  const rows = await getClientDataArray<unknown>(key);
  return rows as T;
}

/** 对齐 A8 `Vt.saveData(key, content, successTip?)` */
export async function saveData(
  key: string,
  content: string,
  successTip?: boolean,
): Promise<boolean> {
  const data = await post<boolean>(
    "Client_SaveData",
    { key, content },
    "",
    { successTip },
  );
  if (data.success !== 1)
    throw new Error(data.msg || "保存失败");
  return true;
}

/** 对齐 A8 `Vt.updateBalance(playerId, balance)` + `{ errorTip: !1 }` */
export async function updateBalance(
  playerId: number,
  balance?: number,
): Promise<UpdateBalanceResult | undefined> {
  if (balance === undefined || !playerId)
    return undefined;
  const res = await post<UpdateBalanceResult>(
    "Client_UpdateBalance",
    { playerId, balance },
    "",
    { errorTip: false },
  );
  return res.success === 1 && res.info ? res.info : undefined;
}
