export {
  createArbExecutionTrace,
  type ArbExecutionTrace,
  type ArbProgressEvent,
  type ArbProgressOutcome,
  type ArbProgressPayload,
} from "@/stores/betting/autoBet/arbExecutionTrace";

export { formatArbProgressTelegramBody } from "@/extensions/notify/formatArbProgress";

export {
  beginArbExecutionTrace,
  setArbExecutionTraceMeta,
  shouldSendArbProgress,
} from "@/stores/betting/autoBet/arbProgressTrace";

export { formatMarketWatchGroup } from "@/extensions/arbMarketWatch/formatMarketWatch";

export {
  buildMarketWatchGroups,
  sameOpportunityLegs,
  type ArbMarketWatchGroup,
} from "@/extensions/arbMarketWatch/watchSinks";

export { shouldSendArbOpportunity } from "@/extensions/notify/arbOpportunityConfig";

export { describeGetOrderOptionsSkip } from "@/domain/betting/describeArbPrepareSkip";

export { formatBetResult, formatLegAccount } from "@/shared/arbBetTraceFormat";
