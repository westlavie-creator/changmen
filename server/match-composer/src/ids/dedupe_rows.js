/**
 * 同 ID 双行（binding stub + 自动簇）合并：Matchs 取并集，盘口取 Sources 更多者。
 * 同馆 SID 冲突：保留 richer 侧，打 warn。
 */
export function mergeMatchs(a = {}, b = {}, { prefer = "b", onConflict } = {}) {
  const out = { ...a };
  for (const [plat, sid] of Object.entries(b || {})) {
    const prev = out[plat];
    if (prev != null && prev !== "" && String(prev) !== String(sid)) {
      onConflict?.(plat, prev, sid);
      if (prefer === "a")
        continue;
    }
    out[plat] = sid;
  }
  return out;
}

export function scoreRowRichness(row) {
  const platforms = Object.keys(row?.Matchs || {}).length;
  let sources = 0;
  for (const bet of row?.Bets || [])
    sources += Object.keys(bet.Sources || {}).length;
  return platforms * 1000 + sources;
}

/**
 * @returns {{ list: object[], mergedCount: number, conflicts: number }}
 */
export function dedupeRowsById(rows) {
  const byId = new Map();
  const ordered = [];
  let mergedCount = 0;
  let conflicts = 0;

  for (const row of rows || []) {
    const id = Number(row?.ID);
    if (!Number.isFinite(id) || id <= 0) {
      ordered.push(row);
      continue;
    }
    const prev = byId.get(id);
    if (!prev) {
      byId.set(id, row);
      ordered.push(row);
      continue;
    }
    mergedCount += 1;
    const richer = scoreRowRichness(row) >= scoreRowRichness(prev) ? row : prev;
    const poorer = richer === row ? prev : row;
    richer.Matchs = mergeMatchs(poorer.Matchs, richer.Matchs, {
      prefer: "b",
      onConflict: (plat, a, b) => {
        conflicts += 1;
        console.warn(
          `[match-composer] dedupe #${id} ${plat} sourceId 冲突: ${a} vs ${b}，保留 richer=${b}`,
        );
      },
    });
    if (!richer.MergeKey && poorer.MergeKey)
      richer.MergeKey = poorer.MergeKey;
    if ((!richer.Title || !String(richer.Title).trim()) && poorer.Title)
      richer.Title = poorer.Title;
    if (!(Number(richer.StartTime) > 0) && Number(poorer.StartTime) > 0)
      richer.StartTime = poorer.StartTime;
    if (!(Number(richer.BO) > 0) && Number(poorer.BO) > 0)
      richer.BO = poorer.BO;
    if (!richer.HomeGbTeamId && poorer.HomeGbTeamId)
      richer.HomeGbTeamId = poorer.HomeGbTeamId;
    if (!richer.AwayGbTeamId && poorer.AwayGbTeamId)
      richer.AwayGbTeamId = poorer.AwayGbTeamId;
    const idx = ordered.indexOf(prev);
    if (idx >= 0)
      ordered[idx] = richer;
    byId.set(id, richer);
  }

  return { list: ordered.filter(Boolean), mergedCount, conflicts };
}
