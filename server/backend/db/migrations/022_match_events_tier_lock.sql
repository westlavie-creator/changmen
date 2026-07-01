-- 运维锁定 pairing_tier：matchMerge 分类时不覆盖 match_events / 物化层 tier

BEGIN;

ALTER TABLE match_events
  ADD COLUMN IF NOT EXISTS pairing_tier_locked boolean NOT NULL DEFAULT false;

ALTER TABLE match_events_history
  ADD COLUMN IF NOT EXISTS pairing_tier_locked boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN match_events.pairing_tier_locked IS
  'true 时 matchMerge 保留 pairing_tier/confidence，不随自动分类降级';

COMMIT;
