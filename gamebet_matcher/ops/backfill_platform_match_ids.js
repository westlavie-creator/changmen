/**
 * 队伍 ID 自动合并成功后，将 client_match id 回写到 platform_matches.match_id。
 * 仅处理 MergeBasis === "id"；已有不同 match_id 的行跳过（保留人工锁定）。
 */

async function backfillPlatformMatchIdsForIdMerges(client, clientMatchRows) {
  if (!client || !clientMatchRows?.length) {
    return { updated: 0, skipped: 0, conflicts: 0 };
  }

  let updated = 0;
  let skipped = 0;
  let conflicts = 0;

  for (const cm of clientMatchRows) {
    if (cm.MergeBasis !== "id") continue;
    const cmId = Number(cm.ID);
    if (!Number.isFinite(cmId)) continue;

    for (const [plat, srcId] of Object.entries(cm.Matchs || {})) {
      const platform = String(plat);
      const sourceMatchId = String(srcId);

      const { data: existing, error: fetchErr } = await client
        .from("platform_matches")
        .select("match_id")
        .eq("platform", platform)
        .eq("source_match_id", sourceMatchId)
        .maybeSingle();
      if (fetchErr) throw new Error(`查询 platform_matches 失败: ${fetchErr.message}`);
      if (!existing) {
        skipped++;
        continue;
      }

      const cur = existing.match_id != null && existing.match_id !== ""
        ? Number(existing.match_id)
        : null;
      if (cur === cmId) {
        skipped++;
        continue;
      }
      if (cur != null && cur !== cmId) {
        conflicts++;
        console.warn(
          `[rebuild] platform_matches ${platform}:${sourceMatchId} 已有 match_id=${cur}，跳过回写 ${cmId}`,
        );
        continue;
      }

      const { error: updErr } = await client
        .from("platform_matches")
        .update({ match_id: cmId })
        .eq("platform", platform)
        .eq("source_match_id", sourceMatchId)
        .is("match_id", null);
      if (updErr) throw new Error(`回写 match_id 失败 (${platform}:${sourceMatchId}): ${updErr.message}`);
      updated++;
    }
  }

  return { updated, skipped, conflicts };
}

export { backfillPlatformMatchIdsForIdMerges };
