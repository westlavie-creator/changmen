-- service_role 需要显式 GRANT 才能绕过 RLS 写入
GRANT ALL ON TABLE canonical_teams    TO service_role;
GRANT ALL ON TABLE team_platform_maps TO service_role;

-- 允许 service_role 使用 identity sequence
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
