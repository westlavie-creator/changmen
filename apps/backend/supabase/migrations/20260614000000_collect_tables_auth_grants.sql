-- platform_matches / platform_bets / live_timers 补发 INSERT, UPDATE 权限
-- 20260611 已加了 RLS 策略，但缺少 GRANT，导致 authenticated 写入报 permission denied

GRANT INSERT, UPDATE ON TABLE platform_matches TO authenticated;
GRANT INSERT, UPDATE ON TABLE platform_bets    TO authenticated;
GRANT INSERT, UPDATE ON TABLE live_timers      TO authenticated;
