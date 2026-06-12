-- client_matches 补发 INSERT / UPDATE / DELETE GRANT
-- 20260612 已加了 INSERT/UPDATE RLS 策略，但缺少 GRANT，导致 authenticated 写入报 permission denied
-- writeClientMatches 还需要 DELETE（清理过期比赛），补齐 policy + grant

GRANT INSERT, UPDATE, DELETE ON TABLE client_matches TO authenticated;

CREATE POLICY "client_matches: authenticated delete"
  ON client_matches FOR DELETE TO authenticated USING (true);
