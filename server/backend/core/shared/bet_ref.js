/**
 * 统一下单凭证：展示用语义 + 执行用原生 ID。
 * @typedef {object} BetRef
 * @property {string} platform
 * @property {string} [gameCode]
 * @property {string} [marketCode]
 * @property {number} stageId
 * @property {"home"|"away"} side
 * @property {string} matchId
 * @property {string} marketId
 * @property {string} oddsId
 * @property {number} odds
 * @property {boolean} locked
 * @property {string} [label]
 */

function assertBetRef(ref) {
  if (!ref || typeof ref !== "object")
    throw new Error("betRef required");
  const missing = ["platform", "matchId", "marketId", "oddsId"].filter(k => !ref[k]);
  if (missing.length)
    throw new Error(`betRef missing: ${missing.join(", ")}`);
  if (ref.odds == null || Number.isNaN(Number(ref.odds))) {
    throw new Error("betRef.odds required");
  }
  if (ref.locked)
    throw new Error("盘口已锁，无法下单");
  return ref;
}

/**
 * @param {object} p
 * @returns {BetRef}
 */
function createBetRef(p) {
  return {
    platform: String(p.platform),
    gameCode: p.gameCode ? String(p.gameCode) : undefined,
    marketCode: p.marketCode ? String(p.marketCode) : "match_winner",
    stageId: Number(p.stageId) || 0,
    side: p.side === "away" ? "away" : "home",
    matchId: String(p.matchId),
    marketId: String(p.marketId),
    oddsId: String(p.oddsId),
    odds: Number(p.odds),
    locked: Boolean(p.locked),
    label: p.label ? String(p.label) : undefined,
  };
}

function obStageBetRefs(stage, matchId, gameCode) {
  return aggregatorStageBetRefs(stage, matchId, gameCode, "OB");
}
function attachObMatchBetRefs(detail, matchId, gameCode) {
  return attachAggregatorMatchBetRefs(detail, matchId, gameCode, "OB");
}

function rayStageBetRefs(stage, matchId, gameCode) {
  return aggregatorStageBetRefs(stage, matchId, gameCode, "RAY");
}
function attachRayMatchBetRefs(detail, matchId, gameCode) {
  return attachAggregatorMatchBetRefs(detail, matchId, gameCode, "RAY");
}

function pbStageBetRefs(stage, matchId, gameCode) {
  return aggregatorStageBetRefs(stage, matchId, gameCode, "PB");
}
function attachPbMatchBetRefs(detail, matchId, gameCode) {
  return attachAggregatorMatchBetRefs(detail, matchId, gameCode, "PB");
}

function tfStageBetRefs(stage, matchId, gameCode) {
  return aggregatorStageBetRefs(stage, matchId, gameCode, "TF");
}
function attachTfMatchBetRefs(detail, matchId, gameCode) {
  return attachAggregatorMatchBetRefs(detail, matchId, gameCode, "TF");
}

function iaStageBetRefs(stage, matchId, gameCode) {
  return aggregatorStageBetRefs(stage, matchId, gameCode, "IA");
}
function attachIaMatchBetRefs(detail, matchId, gameCode) {
  return attachAggregatorMatchBetRefs(detail, matchId, gameCode, "IA");
}

function imtStageBetRefs(stage, matchId, gameCode) {
  return aggregatorStageBetRefs(stage, matchId, gameCode, "IMT");
}
function attachImtMatchBetRefs(detail, matchId, gameCode) {
  return attachAggregatorMatchBetRefs(detail, matchId, gameCode, "IMT");
}

function aggregatorStageBetRefs(stage, matchId, gameCode, platform) {
  if (!stage?.winMarketId)
    return { winHomeRef: null, winAwayRef: null };
  const base = {
    platform: String(platform),
    gameCode,
    marketCode: "match_winner",
    stageId: stage.stageId,
    matchId: String(matchId),
    marketId: String(stage.winMarketId),
    locked: Boolean(stage.winLocked),
  };
  const labelPrefix = stage.label || (stage.stageId === 0 ? "全场" : `地图${stage.stageId}`);
  return {
    winHomeRef:
      stage.winHomeId != null && stage.winHome != null
        ? createBetRef({
            ...base,
            side: "home",
            oddsId: stage.winHomeId,
            odds: stage.winHome,
            label: `${labelPrefix} · 主`,
          })
        : null,
    winAwayRef:
      stage.winAwayId != null && stage.winAway != null
        ? createBetRef({
            ...base,
            side: "away",
            oddsId: stage.winAwayId,
            odds: stage.winAway,
            label: `${labelPrefix} · 客`,
          })
        : null,
  };
}

function attachAggregatorMatchBetRefs(detail, matchId, gameCode, platform) {
  if (!detail?.stages?.length)
    return detail;
  detail.stages = detail.stages.map(stage => ({
    ...stage,
    ...aggregatorStageBetRefs(stage, matchId, gameCode, platform),
  }));
  return detail;
}

function sabaStageBetRefs(stage, matchId, gameCode) {
  return aggregatorStageBetRefs(stage, matchId, gameCode, "SABA");
}

function attachSabaMatchBetRefs(detail, matchId, gameCode) {
  return attachAggregatorMatchBetRefs(detail, matchId, gameCode, "SABA");
}

export {
  aggregatorStageBetRefs,
  assertBetRef,
  attachAggregatorMatchBetRefs,
  attachIaMatchBetRefs,
  attachImtMatchBetRefs,
  attachObMatchBetRefs,
  attachPbMatchBetRefs,
  attachRayMatchBetRefs,
  attachSabaMatchBetRefs,
  attachTfMatchBetRefs,
  createBetRef,
  iaStageBetRefs,
  imtStageBetRefs,
  obStageBetRefs,
  pbStageBetRefs,
  rayStageBetRefs,
  sabaStageBetRefs,
  tfStageBetRefs,
};
