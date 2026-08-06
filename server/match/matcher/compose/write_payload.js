/**
 * client_matches 写库字段辅助。
 * home/away gb：_clearGbLock → 0（清空）；否则 undefined/null → null（保留旧锁）。
 */
export function gbTeamIdForWrite(row, side) {
  if (row?._clearGbLock)
    return 0;
  const v = side === "away" ? row?.AwayGbTeamId : row?.HomeGbTeamId;
  return v ?? null;
}

export function clientMatchWriteRow(m, builtAt) {
  return {
    id: Number(m.ID),
    merge_key: m.MergeKey ? String(m.MergeKey) : null,
    title: String(m.Title || ""),
    game: String(m.Game || ""),
    game_id: String(m.GameID || ""),
    start_time: Number(m.StartTime) || 0,
    bo: Number(m.BO) || 0,
    round: Number(m.Round) || 0,
    round_start: Number(m.RoundStart) || 0,
    reverse: Array.isArray(m.Reverse) ? m.Reverse : [],
    matchs: m.Matchs || {},
    bets: m.Bets || [],
    home_gb_team_id: gbTeamIdForWrite(m, "home"),
    away_gb_team_id: gbTeamIdForWrite(m, "away"),
    built_at: builtAt,
  };
}
