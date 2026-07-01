/**
 * OB 主轴对齐：优先按 client_matches.matchs.OB 槽位挂接，非 OB 平台优先挂到带 OB 轴的赛事。
 * MATCHER_OB_SPINE=0 可关闭（默认开启）。
 */

import { normalizeEpochMs } from "@changmen/shared/time/match_time";

function isObSpineAlignEnabled() {
  return String(process.env.MATCHER_OB_SPINE ?? "1").trim() !== "0";
}

function platformMatchLinked(match) {
  const cid = match?.ClientMatchId ?? match?.client_match_id ?? match?.match_id;
  return cid != null && cid !== "";
}

function assignClientMatchId(match, clientMatchId) {
  const id = Number(clientMatchId);
  match.ClientMatchId = id;
  match.client_match_id = id;
  match.match_id = id;
}

function canAlignPlatformToClient(platform, sourceMatchId, cm) {
  const slot = cm.matchs?.[platform];
  if (slot != null && slot !== "" && String(slot) !== String(sourceMatchId))
    return false;
  return true;
}

function clientMatchHasObSpine(cm) {
  const obId = cm?.matchs?.OB;
  return obId != null && obId !== "";
}

/**
 * 在多个候选 client 行中选最优：时间差最小；preferObSpine 时优先带 OB 轴的行。
 */
function pickBestClientMatch(candidates, platformStartMs, opts = {}) {
  const { preferObSpine = false } = opts;
  if (!candidates?.length)
    return null;
  if (candidates.length === 1)
    return candidates[0];

  let best = candidates[0];
  let bestScore = Number.POSITIVE_INFINITY;
  const startMs = normalizeEpochMs(platformStartMs);

  for (const cm of candidates) {
    const cmStart = normalizeEpochMs(cm.start_time ?? cm.StartTime);
    let score = cmStart && startMs
      ? Math.abs(cmStart - startMs)
      : Number.POSITIVE_INFINITY;

    if (preferObSpine) {
      if (clientMatchHasObSpine(cm))
        score -= 1_000_000_000;
      else
        score += 10_000_000;
    }

    if (score < bestScore || (score === bestScore && Number(cm.id) < Number(best.id))) {
      best = cm;
      bestScore = score;
    }
  }
  return best;
}

function buildObSourceIdIndex(clientRows) {
  const byObId = new Map();
  for (const cm of clientRows || []) {
    const obId = cm.matchs?.OB;
    if (obId == null || obId === "")
      continue;
    const key = String(obId);
    if (!byObId.has(key))
      byObId.set(key, []);
    byObId.get(key).push(cm);
  }
  return byObId;
}

/**
 * OB 平台场次按 client 行已有 matchs.OB 槽位回挂（内存 ClientMatchId）。
 */
function alignObSpineSlotMatches(matches, clientRows) {
  let alignedByObSlot = 0;
  if (!isObSpineAlignEnabled() || !clientRows?.length)
    return { alignedByObSlot };

  const byObId = buildObSourceIdIndex(clientRows);
  const obBlock = matches?.OB;
  if (!obBlock || typeof obBlock !== "object")
    return { alignedByObSlot };

  for (const match of Object.values(obBlock)) {
    if (!match?.SourceMatchID || platformMatchLinked(match))
      continue;
    const sid = String(match.SourceMatchID);
    const candidates = (byObId.get(sid) || [])
      .filter(cm => canAlignPlatformToClient("OB", sid, cm));
    const hit = pickBestClientMatch(candidates, match.StartTime);
    if (!hit)
      continue;
    assignClientMatchId(match, hit.id);
    alignedByObSlot++;
  }

  return { alignedByObSlot };
}

export {
  alignObSpineSlotMatches,
  clientMatchHasObSpine,
  isObSpineAlignEnabled,
  pickBestClientMatch,
};
