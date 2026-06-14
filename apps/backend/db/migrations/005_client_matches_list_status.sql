-- client_matches.list_status：浏览器列表可见性（0=展示，-1=Client_GetMatchs 不返回）

ALTER TABLE client_matches
  ADD COLUMN IF NOT EXISTS list_status smallint NOT NULL DEFAULT 0;

COMMENT ON COLUMN client_matches.list_status IS
  '浏览器列表可见性：0 等正常展示；-1 表示 Client_GetMatchs 不返回该行';
