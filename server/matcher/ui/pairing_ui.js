/**
 * Matcher UI：配对分层 / 绑定元数据展示（仅运维 UI，不进 Client_GetMatchs）。
 */

const TIER_LABELS = {
  verified: "已确认",
  provisional: "队名合并",
  staging: "单平台",
};

const TIER_SORT = { verified: 0, provisional: 1, staging: 2 };

const BINDING_SOURCE_LABELS = {
  auto_id: "ID 自动",
  auto_name: "队名自动",
  align: "对齐",
  manual: "人工",
  legacy: "历史",
};

function tierLabel(tier) {
  return TIER_LABELS[String(tier || "").toLowerCase()] || "未知";
}

function bindingSourceLabel(source) {
  return BINDING_SOURCE_LABELS[String(source || "").toLowerCase()] || String(source || "—");
}

function formatConfidence(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0)
    return "—";
  return `${Math.round(n * 100)}%`;
}

function enrichClientMatchPairing(cm) {
  const tier = String(cm.pairing_tier || "").toLowerCase() || inferTierFromMergeMode(cm);
  const confidence = cm.pairing_confidence != null ? Number(cm.pairing_confidence) : null;
  return {
    ...cm,
    pairing: {
      tier,
      label: tierLabel(tier),
      confidence,
      confidence_label: formatConfidence(confidence),
      event_anchor: cm.event_anchor ? String(cm.event_anchor) : null,
    },
  };
}

function inferTierFromMergeMode(cm) {
  if (Object.keys(cm.matchs || {}).length < 2)
    return "staging";
  if (cm.merge_mode?.mode === "id")
    return "verified";
  return "provisional";
}

function enrichPlatformRowBinding(row) {
  const source = row.binding_source ?? row.BindingSource ?? null;
  const confidence = row.binding_confidence ?? row.BindingConfidence ?? null;
  const sideMode = row.binding_side_mode ?? row.BindingSideMode ?? null;
  if (source == null && confidence == null && sideMode == null)
    return row;
  return {
    ...row,
    binding: {
      source: source ? String(source) : null,
      source_label: bindingSourceLabel(source),
      confidence: confidence != null ? Number(confidence) : null,
      confidence_label: formatConfidence(confidence),
      side_mode: sideMode ? String(sideMode) : null,
    },
  };
}

function summarizePairingStats(clientMatches) {
  const counts = { verified: 0, provisional: 0, staging: 0, unknown: 0 };
  let confidenceSum = 0;
  let confidenceN = 0;

  for (const cm of clientMatches || []) {
    const tier = cm.pairing?.tier || inferTierFromMergeMode(cm);
    if (counts[tier] != null)
      counts[tier]++;
    else
      counts.unknown++;

    const c = cm.pairing?.confidence;
    if (Number.isFinite(c) && c > 0) {
      confidenceSum += c;
      confidenceN++;
    }
  }

  return {
    ...counts,
    total: (clientMatches || []).length,
    avg_confidence: confidenceN ? Math.round((confidenceSum / confidenceN) * 100) / 100 : null,
  };
}

/**
 * @param {{ clientMatches?: object[], platforms?: Record<string, object[]> }} dashboard
 */
function enrichDashboardPairing(dashboard) {
  const clientMatches = (dashboard.clientMatches || []).map(enrichClientMatchPairing);
  const platforms = {};
  for (const [plat, rows] of Object.entries(dashboard.platforms || {})) {
    platforms[plat] = (rows || []).map(enrichPlatformRowBinding);
  }

  const pairing = summarizePairingStats(clientMatches);
  const debug = {
    ...(dashboard.debug || {}),
    pairing,
  };

  return {
    ...dashboard,
    clientMatches,
    platforms,
    debug,
  };
}

export {
  bindingSourceLabel,
  enrichClientMatchPairing,
  enrichDashboardPairing,
  enrichPlatformRowBinding,
  formatConfidence,
  inferTierFromMergeMode,
  summarizePairingStats,
  tierLabel,
  TIER_SORT,
};
