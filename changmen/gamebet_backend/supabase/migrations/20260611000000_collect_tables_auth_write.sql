-- collect 表写入策略：允许登录用户 INSERT / UPDATE
-- Electron 模式下后端跑在用户机器上，不应依赖 service_role key
-- authenticated 角色 = 已登录的 Supabase 用户

CREATE POLICY "platform_matches: authenticated write"
  ON platform_matches FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "platform_matches: authenticated update"
  ON platform_matches FOR UPDATE TO authenticated
  USING (true);

CREATE POLICY "platform_bets: authenticated write"
  ON platform_bets FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "platform_bets: authenticated update"
  ON platform_bets FOR UPDATE TO authenticated
  USING (true);

CREATE POLICY "live_timers: authenticated write"
  ON live_timers FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "live_timers: authenticated update"
  ON live_timers FOR UPDATE TO authenticated
  USING (true);
