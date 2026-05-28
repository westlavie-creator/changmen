"use strict";

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
  if (!ref || typeof ref !== "object") throw new Error("betRef required");
  const missing = ["platform", "matchId", "marketId", "oddsId"].filter((k) => !ref[k]);
  if (missing.length) throw new Error(`betRef missing: ${missing.join(", ")}`);
  if (ref.odds == null || Number.isNaN(Number(ref.odds))) {
    throw new Error("betRef.odds required");
  }
  if (ref.locked) throw new Error("盘口已锁，无法下单");
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

/**
 * OB Feed stage → 主/客 BetRef
 */
function obStageBetRefs(stage, matchId, gameCode) {
  if (!stage?.winMarketId) return { winHomeRef: null, winAwayRef: null };
  const base = {
    platform: "OB",
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

function attachObMatchBetRefs(detail, matchId, gameCode) {
  if (!detail?.stages?.length) return detail;
  detail.stages = detail.stages.map((stage) => ({
    ...stage,
    ...obStageBetRefs(stage, matchId, gameCode),
  }));
  return detail;
}

/**
 * RAY Feed stage → 主/客 BetRef
 */
function rayStageBetRefs(stage, matchId, gameCode) {
  if (!stage?.winMarketId) return { winHomeRef: null, winAwayRef: null };
  const base = {
    platform: "RAY",
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

function attachRayMatchBetRefs(detail, matchId, gameCode) {
  if (!detail?.stages?.length) return detail;
  detail.stages = detail.stages.map((stage) => ({
    ...stage,
    ...rayStageBetRefs(stage, matchId, gameCode),
  }));
  return detail;
}

function pbStageBetRefs(stage, matchId, gameCode) {
  if (!stage?.winMarketId) return { winHomeRef: null, winAwayRef: null };
  const base = {
    platform: "PB",
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

function attachPbMatchBetRefs(detail, matchId, gameCode) {
  if (!detail?.stages?.length) return detail;
  detail.stages = detail.stages.map((stage) => ({
    ...stage,
    ...pbStageBetRefs(stage, matchId, gameCode),
  }));
  return detail;
}

function tfStageBetRefs(stage, matchId, gameCode) {
  if (!stage?.winMarketId) return { winHomeRef: null, winAwayRef: null };
  const base = {
    platform: "TF",
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

function attachTfMatchBetRefs(detail, matchId, gameCode) {
  if (!detail?.stages?.length) return detail;
  detail.stages = detail.stages.map((stage) => ({
    ...stage,
    ...tfStageBetRefs(stage, matchId, gameCode),
  }));
  return detail;
}

function iaStageBetRefs(stage, matchId, gameCode) {
  if (!stage?.winMarketId) return { winHomeRef: null, winAwayRef: null };
  const base = {
    platform: "IA",
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

function attachIaMatchBetRefs(detail, matchId, gameCode) {
  if (!detail?.stages?.length) return detail;
  detail.stages = detail.stages.map((stage) => ({
    ...stage,
    ...iaStageBetRefs(stage, matchId, gameCode),
  }));
  return detail;
}

function imtStageBetRefs(stage, matchId, gameCode) {
  if (!stage?.winMarketId) return { winHomeRef: null, winAwayRef: null };
  const base = {
    platform: "IMT",
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

function attachImtMatchBetRefs(detail, matchId, gameCode) {
  if (!detail?.stages?.length) return detail;
  detail.stages = detail.stages.map((stage) => ({
    ...stage,
    ...imtStageBetRefs(stage, matchId, gameCode),
  }));
  return detail;
}

function aggregatorStageBetRefs(stage, matchId, gameCode, platform) {
  if (!stage?.winMarketId) return { winHomeRef: null, winAwayRef: null };
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
  if (!detail?.stages?.length) return detail;
  detail.stages = detail.stages.map((stage) => ({
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

module.exports = {
  assertBetRef,
  createBetRef,
  obStageBetRefs,
  attachObMatchBetRefs,
  rayStageBetRefs,
  attachRayMatchBetRefs,
  pbStageBetRefs,
  attachPbMatchBetRefs,
  tfStageBetRefs,
  attachTfMatchBetRefs,
  iaStageBetRefs,
  attachIaMatchBetRefs,
  imtStageBetRefs,
  attachImtMatchBetRefs,
  aggregatorStageBetRefs,
  attachAggregatorMatchBetRefs,
  sabaStageBetRefs,
  attachSabaMatchBetRefs,
};
