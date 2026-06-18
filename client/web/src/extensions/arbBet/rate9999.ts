/** @deprecated 请从 `@/domain/betting/singleLegRate` 引用；本文件仅保留兼容转发 */
export {
  SINGLE_LEG_RATE,
  RATE_SKIP,
  isSingleLegRateAtOdds,
  isRateSkipAtOdds,
  arbAccountPickerFilter,
  explainArbAccountRejection,
  legHasSingleLegRateAccount,
  isLegSkippedByRate9999,
  findSingleLegRateAccount,
  resolveSingleLegByRate,
  resolveRate9999SingleLeg,
  allowArbBetExecution,
  explainAllowArbRejection,
  createArbLinkId,
} from "@/domain/betting/singleLegRate";
