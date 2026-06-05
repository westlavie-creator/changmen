-- 显式授予 service_role 对所有业务表的完整权限
-- 背景：Supabase 初始化时只自动授权"已有表"，迁移新建的表不会自动继承
-- service_role 本身具有 BYPASSRLS，但仍需要 Postgres 表级 GRANT 才能操作

GRANT ALL ON TABLE profiles         TO service_role;
GRANT ALL ON TABLE orders           TO service_role;
GRANT ALL ON TABLE platform_matches TO service_role;
GRANT ALL ON TABLE platform_bets    TO service_role;
GRANT ALL ON TABLE live_timers      TO service_role;
GRANT ALL ON TABLE client_matches   TO service_role;
