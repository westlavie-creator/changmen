export { describeGetOrderOptionsSkip } from "@/domain/betting/describeArbPrepareSkip";

export { formatMarketWatchGroup } from "@/extensions/arbMarketWatch/formatMarketWatch";

export {
  type ArbMarketWatchGroup,
  buildMarketWatchGroups,
  sameOpportunityLegs,
} from "@/extensions/arbMarketWatch/watchSinks";

export { shouldSendArbOpportunity } from "@/extensions/notify/arbOpportunityConfig";

export { formatArbProgressTelegramBody } from "@/extensions/notify/formatArbProgress";

export { formatBetResult, formatLegAccount } from "@/shared/arbBetTraceFormat";

export {
  type ArbExecutionTrace,
  type ArbProgressEvent,
  type ArbProgressOutcome,
  type ArbProgressPayload,
  createArbExecutionTrace,
} from "@/stores/betting/autoBet/arbExecutionTrace";

export {
  beginArbExecutionTrace,
  setArbExecutionTraceMeta,
  shouldCollectArbProgress,
  shouldSendArbProgress,
} from "@/stores/betting/autoBet/arbProgressTrace";
