-- 关闭 client_matches 的 Realtime 推送
--
-- 前端已改为 30 秒轮询 Client_GetMatchs。继续把 client_matches 放在
-- supabase_realtime publication 中会让误订阅客户端收到高频整行 payload，
-- 放大 Realtime messages 与 egress。
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'client_matches'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE client_matches;
  END IF;
END $$;
