-- 补发 platform_matches / platform_bets / live_timers 的表级权限
-- service_role 用于后端写入，authenticated 用于前端只读

GRANT ALL    ON TABLE platform_matches TO postgres, service_role;
GRANT SELECT ON TABLE platform_matches TO anon, authenticated;

GRANT ALL    ON TABLE platform_bets    TO postgres, service_role;
GRANT SELECT ON TABLE platform_bets    TO anon, authenticated;

GRANT ALL    ON TABLE live_timers      TO postgres, service_role;
GRANT SELECT ON TABLE live_timers      TO anon, authenticated;
