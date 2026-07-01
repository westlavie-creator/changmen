/**
 * Matcher UI：client_matches / platform_matches 与 event_bindings 差异报告。
 */

import { validateEventRegistryConsistency } from "../ops/registry_reconcile.js";

const ISSUE_LABELS = {
  missing_binding: "物化缺绑定",
  source_mismatch: "场次 ID 不一致",
  extra_binding: "真相表多余绑定",
  no_registry_binding: "platform 无真相绑定",
  match_id_mismatch: "match_id 不一致",
  binding_source_mismatch: "binding_source 不一致",
};

function issueLabel(issue) {
  return ISSUE_LABELS[issue] || issue;
}

function platformRowEventId(row) {
  const raw = row?.client_match_id ?? row?.match_id ?? row?.ClientMatchId;
  if (raw == null || raw === "")
    return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {{
 *   clientMatches?: object[],
 *   platforms?: Record<string, object[]>,
 *   eventBindings?: object[],
 * }} input
 */
function buildRegistryDriftReport(input = {}) {
  const { clientMatches, platforms, eventBindings } = input;
  const bindings = eventBindings || [];

  const materializedRows = (clientMatches || []).map(cm => ({
    ID: cm.id,
    Matchs: cm.matchs || {},
  }));
  const materialized = validateEventRegistryConsistency(materializedRows, bindings);

  const bindingByKey = new Map(
    bindings.map(b => [`${b.platform}:${String(b.source_match_id)}`, b]),
  );

  const platformDrift = [];
  for (const [plat, rows] of Object.entries(platforms || {})) {
    for (const m of rows || []) {
      const sid = String(m.source_match_id);
      const key = `${plat}:${sid}`;
      const eb = bindingByKey.get(key);
      const pmEventId = platformRowEventId(m);

      if (!eb) {
        if (pmEventId != null) {
          platformDrift.push({
            platform: plat,
            source_match_id: sid,
            issue: "no_registry_binding",
            pm_match_id: pmEventId,
          });
        }
        continue;
      }

      if (pmEventId != null && pmEventId !== Number(eb.event_id)) {
        platformDrift.push({
          platform: plat,
          source_match_id: sid,
          issue: "match_id_mismatch",
          pm_match_id: pmEventId,
          registry_event_id: Number(eb.event_id),
        });
      }

      const pmSource = String(m.binding_source ?? m.BindingSource ?? "").toLowerCase();
      const regSource = String(eb.binding_source ?? "").toLowerCase();
      if (pmSource && regSource && pmSource !== regSource) {
        platformDrift.push({
          platform: plat,
          source_match_id: sid,
          issue: "binding_source_mismatch",
          pm_source: pmSource,
          registry_source: regSource,
          registry_event_id: Number(eb.event_id),
        });
      }
    }
  }

  const platformKeys = new Set();
  for (const [plat, rows] of Object.entries(platforms || {})) {
    for (const m of rows || []) {
      platformKeys.add(`${plat}:${String(m.source_match_id)}`);
    }
  }

  const orphanBindings = bindings
    .filter(b => !platformKeys.has(`${b.platform}:${String(b.source_match_id)}`))
    .map(b => ({
      platform: b.platform,
      source_match_id: String(b.source_match_id),
      event_id: Number(b.event_id),
      binding_source: b.binding_source ?? null,
    }));

  const issueCount
    = materialized.mismatches.length
      + platformDrift.length
      + orphanBindings.length;

  return {
    ok: issueCount === 0,
    issueCount,
    materialized: materialized.mismatches,
    platformDrift,
    orphanBindings,
    issueLabel,
  };
}

function summarizeRegistryDrift(drift) {
  if (!drift)
    return { ok: true, issueCount: 0 };
  return {
    ok: drift.ok,
    issueCount: drift.issueCount,
    materialized: drift.materialized?.length || 0,
    platform: drift.platformDrift?.length || 0,
    orphan: drift.orphanBindings?.length || 0,
  };
}

export {
  buildRegistryDriftReport,
  issueLabel,
  summarizeRegistryDrift,
};
