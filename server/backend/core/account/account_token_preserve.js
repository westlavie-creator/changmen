/** 客户端 toJSON 省略 token 时，保留库里已有凭证，避免整包 SaveData 把 Stake session 写成空 */
export function preserveStoredAccountToken(incoming, stored) {
  const next = incoming && typeof incoming === "object" ? { ...incoming } : {};
  const hasToken = Object.prototype.hasOwnProperty.call(next, "token")
    || Object.prototype.hasOwnProperty.call(next, "Token");
  if (hasToken)
    return next;
  const prev = stored && typeof stored === "object" ? (stored.token ?? stored.Token) : undefined;
  if (prev != null && String(prev).trim())
    next.token = prev;
  return next;
}
