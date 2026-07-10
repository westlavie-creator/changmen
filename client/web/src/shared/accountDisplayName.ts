/** 订单/列表展示用账号名：优先场馆平台账号，回退 playerName */
export function accountOrderDisplayName(acc: {
  venueAccountName?: string;
  playerName?: string;
  accountId?: number;
} | null | undefined): string {
  if (!acc)
    return "";
  const venue = String(acc.venueAccountName || "").trim();
  if (venue)
    return venue;
  const name = String(acc.playerName || "").trim();
  if (name)
    return name;
  const id = Number(acc.accountId) || 0;
  return id ? `#${id}` : "";
}
