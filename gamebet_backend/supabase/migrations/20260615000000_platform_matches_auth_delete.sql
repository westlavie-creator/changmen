-- platform_matches 补发 DELETE 权限（writePlatformMatches 需要删除已结束比赛）
-- platform_bets / live_timers 代码里无删除操作，不需要

GRANT DELETE ON TABLE platform_matches TO authenticated;

CREATE POLICY "platform_matches: authenticated delete"
  ON platform_matches FOR DELETE TO authenticated USING (true);
