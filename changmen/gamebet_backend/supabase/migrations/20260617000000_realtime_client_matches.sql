-- 开启 client_matches 的 Realtime 推送
-- 前端通过 postgres_changes 订阅此表替代 30s HTTP 轮询
ALTER PUBLICATION supabase_realtime ADD TABLE client_matches;
