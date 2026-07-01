/**
 * matchMerge 后：赛事实体分层 + platform_matches 绑定元数据。
 * Client_GetMatchs DTO 不变；默认仍发布 name 合并场次（MATCHER_PUBLISH_PROVISIONAL≠0）。
 */

import { upsertPlatformBindings } from "@changmen/db";
import { PROVIDER_PRIORITY } from "@changmen/match-engine";

const PAIRING_TIER = {
  VERIFIED: "verified",
  PROVISIONAL: "provisional",
  STAGING: "staging",
};

const BINDING_SOURCE = {
  AUTO_ID: "auto_id",
  AUTO_NAME: "auto_name",
  ALIGN: "align",
  MANUAL: "manual",
  LEGACY: "legacy",
};

function platformCount(row) {
  return Object.keys(row?.Matchs || {}).length;
}

function findPlatformMatchInShape(matches, platform, sourceMatchId) {
  const byId = matches?.[platform];
  if (!byId)
    return null;
  const sid = String(sourceMatchId);
  return byId[sid] || Object.values(byId).find(m => String(m.SourceMatchID) === sid) || null;
}

/** 仅 binding_source=manual（运维确认 / 拖线）计为人工 verified，不含 auto 回写 match_id */
function rowHasManualBinding(row, matches) {
  for (const [plat, srcId] of Object.entries(row?.Matchs || {})) {
    const pm = findPlatformMatchInShape(matches, plat, srcId);
    const src = String(pm?.BindingSource ?? pm?.binding_source ?? "").toLowerCase();
    if (src === BINDING_SOURCE.MANUAL)
      return true;
  }
  return false;
}

function resolveEventAnchor(matchs) {
  const obId = matchs?.OB;
  if (obId != null && obId !== "")
    return `OB:${String(obId)}`;

  let bestPri = -1;
  let anchor = null;
  for (const [platform, sourceId] of Object.entries(matchs || {})) {
    const pri = PROVIDER_PRIORITY[platform] || 0;
    if (pri > bestPri) {
      bestPri = pri;
      anchor = `${platform}:${String(sourceId)}`;
    }
  }
  return anchor;
}

function bindingSideModeForPlatform(row, platform) {
  const ambiguous = new Set(row?.SideAlignAmbiguous || []);
  if (ambiguous.has(platform))
    return "ambiguous";
  const reverse = new Set(row?.Reverse || []);
  if (reverse.has(platform))
    return "reversed";
  return "aligned";
}

/**
 * @returns {{ tier: string, confidence: number, bindingSource: string }}
 */
function classifyPairing(row, { matches }) {
  const count = platformCount(row);
  if (count < 2) {
    return {
      tier: PAIRING_TIER.STAGING,
      confidence: 0,
      bindingSource: BINDING_SOURCE.AUTO_NAME,
    };
  }

  if (rowHasManualBinding(row, matches)) {
    return {
      tier: PAIRING_TIER.VERIFIED,
      confidence: 1,
      bindingSource: BINDING_SOURCE.MANUAL,
    };
  }

  const mergeBasis = String(row.MergeBasis || "").toLowerCase();
  const hasGbAnchor = Boolean(row.HomeGbTeamId && row.AwayGbTeamId);
  const ambiguous = Array.isArray(row.SideAlignAmbiguous) && row.SideAlignAmbiguous.length > 0;

  if (mergeBasis === "id" || hasGbAnchor) {
    return {
      tier: PAIRING_TIER.VERIFIED,
      confidence: mergeBasis === "id" ? 0.95 : 0.9,
      bindingSource: BINDING_SOURCE.AUTO_ID,
    };
  }

  if (ambiguous) {
    return {
      tier: PAIRING_TIER.PROVISIONAL,
      confidence: 0.65,
      bindingSource: BINDING_SOURCE.AUTO_NAME,
    };
  }

  if (mergeBasis === "name") {
    return {
      tier: PAIRING_TIER.PROVISIONAL,
      confidence: 0.8,
      bindingSource: BINDING_SOURCE.AUTO_NAME,
    };
  }

  return {
    tier: PAIRING_TIER.VERIFIED,
    confidence: 0.85,
    bindingSource: BINDING_SOURCE.AUTO_NAME,
  };
}

function isPublishProvisionalEnabled() {
  return String(process.env.MATCHER_PUBLISH_PROVISIONAL ?? "1").trim() !== "0";
}

function isPublishTierVerifiedOnly() {
  return String(process.env.MATCHER_PUBLISH_TIER ?? "").trim().toLowerCase() === "verified";
}

/**
 * 标注 pairing 字段，并按策略过滤待写入 client_matches 的行。
 * @param {object[]} rows matchMerge 产物
 * @param {object} matches normalizeMatchesShape 结果
 */
function applyPairingMetadata(rows, matches, opts = {}) {
  const lockedTiers = opts.lockedTiers || new Map();
  const annotated = (rows || []).map((row) => {
    const pairing = classifyPairing(row, { matches });
    const lock = lockedTiers.get(Number(row.ID));
    const tier = lock?.tier || pairing.tier;
    const confidence = lock?.confidence ?? pairing.confidence;
    return {
      ...row,
      PairingTier: tier,
      PairingConfidence: confidence,
      EventAnchor: resolveEventAnchor(row.Matchs),
      _pairingBindingSource: pairing.bindingSource,
      PairingTierLocked: Boolean(lock?.tier),
    };
  });

  const publishProvisional = isPublishProvisionalEnabled();
  const verifiedOnly = isPublishTierVerifiedOnly();

  const published = annotated.filter((row) => {
    if (platformCount(row) < 2)
      return false;
    if (row.PairingTier === PAIRING_TIER.STAGING)
      return false;
    if (verifiedOnly && row.PairingTier !== PAIRING_TIER.VERIFIED)
      return false;
    if (!publishProvisional && row.PairingTier === PAIRING_TIER.PROVISIONAL)
      return false;
    return true;
  });

  return { annotated, published };
}

/**
 * 从 merge 行收集 platform 绑定元数据（platform_matches / event_bindings 共用）。
 */
function collectBindingsForRows(rows, matches) {
  const bindings = [];
  const now = Date.now();

  for (const row of rows || []) {
    const cmId = Number(row.ID);
    if (!Number.isFinite(cmId))
      continue;

    const eventConfidence = Number(row.PairingConfidence) || 0;
    const defaultSource = row._pairingBindingSource || BINDING_SOURCE.AUTO_NAME;

    for (const [platform, sourceMatchId] of Object.entries(row.Matchs || {})) {
      const pm = findPlatformMatchInShape(matches, platform, sourceMatchId);
      const existingSource = String(pm?.BindingSource ?? pm?.binding_source ?? "").toLowerCase();
      const source = existingSource === BINDING_SOURCE.MANUAL
        ? BINDING_SOURCE.MANUAL
        : defaultSource;
      bindings.push({
        platform,
        source_match_id: String(sourceMatchId),
        match_id: cmId,
        binding_confidence: eventConfidence,
        binding_source: source,
        binding_side_mode: bindingSideModeForPlatform(row, platform),
        bound_at: now,
      });
    }
  }

  return bindings;
}

/**
 * 将绑定元数据写入 platform_matches（与 match_id 一并更新）。
 */
async function syncPlatformBindingsForRows(rows, matches) {
  const bindings = collectBindingsForRows(rows, matches);
  if (!bindings.length)
    return { updated: 0 };

  return upsertPlatformBindings(bindings);
}

export {
  applyPairingMetadata,
  BINDING_SOURCE,
  bindingSideModeForPlatform,
  classifyPairing,
  collectBindingsForRows,
  findPlatformMatchInShape,
  isPublishProvisionalEnabled,
  isPublishTierVerifiedOnly,
  PAIRING_TIER,
  resolveEventAnchor,
  syncPlatformBindingsForRows,
};
