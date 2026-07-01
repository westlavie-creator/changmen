-- 配对元数据：赛事实体分层（client_matches）+ 平台绑定置信度（platform_matches）
-- 前端 Client_GetMatchs DTO 不变；字段供 matcher 物化与运维。

BEGIN;

ALTER TABLE client_matches
  ADD COLUMN IF NOT EXISTS pairing_tier text,
  ADD COLUMN IF NOT EXISTS pairing_confidence real,
  ADD COLUMN IF NOT EXISTS event_anchor text;

ALTER TABLE client_matches_history
  ADD COLUMN IF NOT EXISTS pairing_tier text,
  ADD COLUMN IF NOT EXISTS pairing_confidence real,
  ADD COLUMN IF NOT EXISTS event_anchor text;

ALTER TABLE platform_matches
  ADD COLUMN IF NOT EXISTS binding_confidence real,
  ADD COLUMN IF NOT EXISTS binding_source text,
  ADD COLUMN IF NOT EXISTS binding_side_mode text,
  ADD COLUMN IF NOT EXISTS bound_at bigint;

COMMENT ON COLUMN client_matches.pairing_tier IS
  'verified | provisional | staging；仅 verified（默认）进入 Client_GetMatchs';
COMMENT ON COLUMN client_matches.pairing_confidence IS '0~1，事件级配对置信度';
COMMENT ON COLUMN client_matches.event_anchor IS '主轴场次，如 OB:12345';
COMMENT ON COLUMN platform_matches.binding_confidence IS '0~1，平台绑定置信度';
COMMENT ON COLUMN platform_matches.binding_source IS
  'auto_id | auto_name | align | manual | legacy';
COMMENT ON COLUMN platform_matches.binding_side_mode IS
  'aligned | reversed | ambiguous';

UPDATE client_matches
SET pairing_tier = 'verified',
    pairing_confidence = 1.0
WHERE pairing_tier IS NULL;

UPDATE platform_matches
SET binding_source = 'legacy',
    binding_confidence = 1.0,
    bound_at = synced_at
WHERE match_id IS NOT NULL
  AND binding_source IS NULL;

COMMIT;
