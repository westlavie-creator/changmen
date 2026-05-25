/** 对齐 A8 bundle `ly`：transactions 走 api-v4 子域 */
export function tfGatewayUrl(gateway: string, path: string): string {
  let base = gateway.replace(/\/$/, "");
  if (/transactions/.test(path)) {
    base = base.replace("api.", "api-v4.");
  }
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/** TF 欧赔 → API odds / member.odds（A8 wYe） */
export function tfOddsPayload(euroOdds: number) {
  const odds = (euroOdds <= 2 ? euroOdds - 1 : -1 / (euroOdds - 1)).toFixed(2);
  const american = Number(odds);
  const memberEuro =
    american > 0 ? 1 + american : 1 + Math.floor(100 / Math.abs(american)) / 100;
  return {
    odds,
    memberOdds: memberEuro.toFixed(2),
  };
}

export function parseTfItemId(itemId: string) {
  const idx = itemId.indexOf(":");
  if (idx === -1) return { marketId: itemId, selection: "home" };
  return {
    marketId: itemId.slice(0, idx),
    selection: itemId.slice(idx + 1) || "home",
  };
}
