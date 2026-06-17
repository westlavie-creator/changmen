export {
  createArbExecutionTrace,
  formatArbProgressTelegramBody,
  type ArbExecutionTrace,
  type ArbProgressEvent,
  type ArbProgressOutcome,
  type ArbProgressPayload,
} from "@/extensions/notify/arbExecutionTrace";

export {
  beginArbExecutionTrace,
  setArbExecutionTraceMeta,
  shouldSendArbProgress,
} from "@/extensions/notify/arbProgressConfig";

export { describeGetOrderOptionsSkip } from "@/extensions/notify/describeArbPrepareSkip";

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
  result?: { success: boolean; message?: string },
): string {
  if (!result) return `${provider} ${target} 未下单`;
  const icon = result.success ? "✅" : "❌";
  const msg = result.message ? ` (${result.message})` : "";
  return `${provider} ${target} ${icon} ${betMoney}@${odds}${msg}`;
}
