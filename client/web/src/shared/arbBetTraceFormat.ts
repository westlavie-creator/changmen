export function formatLegAccount(
  provider: string,
  playerName?: string,
): string {
  return playerName ? `${provider}/${playerName}` : provider;
}

export function formatBetResult(
  provider: string,
  target: string,
  betMoney: number,
  odds: number,
  result?: { success: boolean; pending?: boolean; message?: string | null },
): string {
  if (!result)
    return `${provider} ${target} 未下单`;
  const icon = result.pending ? "⏳" : result.success ? "✅" : "❌";
  const msg = result.message ? ` (${result.message})` : "";
  return `${provider} ${target} ${icon} ${betMoney}@${odds}${msg}`;
}
