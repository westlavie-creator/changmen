-- 收敛采集表权限：authenticated 只读，写入收归 service_role
-- 背景：便携包已内置 .env（含 service_role），原"Electron 不依赖 service_role"前提已不成立
-- 采集数据是全局共享数据，不应由任意登录用户直接写入

-- ── platform_matches ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "platform_matches: authenticated write"  ON platform_matches;
DROP POLICY IF EXISTS "platform_matches: authenticated update" ON platform_matches;
DROP POLICY IF EXISTS "platform_matches: authenticated delete" ON platform_matches;
REVOKE INSERT, UPDATE, DELETE ON TABLE platform_matches FROM authenticated;

-- ── platform_bets ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "platform_bets: authenticated write"  ON platform_bets;
DROP POLICY IF EXISTS "platform_bets: authenticated update" ON platform_bets;
REVOKE INSERT, UPDATE ON TABLE platform_bets FROM authenticated;

-- ── live_timers ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "live_timers: authenticated write"  ON live_timers;
DROP POLICY IF EXISTS "live_timers: authenticated update" ON live_timers;
REVOKE INSERT, UPDATE ON TABLE live_timers FROM authenticated;

-- ── client_matches ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "client_matches: authenticated write"  ON client_matches;
DROP POLICY IF EXISTS "client_matches: authenticated update" ON client_matches;
DROP POLICY IF EXISTS "client_matches: authenticated delete" ON client_matches;
REVOKE INSERT, UPDATE, DELETE ON TABLE client_matches FROM authenticated;
