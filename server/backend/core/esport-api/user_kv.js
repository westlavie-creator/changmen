/** UI 通过 Client_GetData 读取的 KV 键：数组类需直接返回 []，对象类需 spread 为 { success, msg, ...fields } */
export const ARRAY_KEYS = new Set(["ACCOUNT", "PROXY", "GoogleCode", "Wallet"]);
export const OBJECT_KEYS = new Set(["USERCONFIG", "Follow", "Message", "CollectConfig"]);

export function isArrayKey(key) {
  return ARRAY_KEYS.has(key);
}

export function isObjectKey(key) {
  return OBJECT_KEYS.has(key);
}

export function emptyDirectValue(key) {
  if (isArrayKey(key)) return [];
  if (isObjectKey(key)) return { success: 1, msg: "ok" };
  return null;
}

export function wrapObjectDirect(parsed) {
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return { success: 1, msg: "ok", ...parsed };
  }
  return parsed;
}
