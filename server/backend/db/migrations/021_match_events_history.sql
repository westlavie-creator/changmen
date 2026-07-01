-- 赛事实体 / 绑定归档（与 client_matches_history 对称）

BEGIN;

CREATE TABLE IF NOT EXISTS match_events_history (
  LIKE match_events INCLUDING ALL
);

ALTER TABLE match_events_history
  ADD COLUMN IF NOT EXISTS archived_at bigint NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS event_bindings_history (
  platform            text NOT NULL,
  source_match_id     text NOT NULL,
  event_id            bigint NOT NULL,
  binding_confidence  real,
  binding_source      text,
  binding_side_mode   text,
  bound_at            bigint,
  archived_at         bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (platform, source_match_id, archived_at)
);

CREATE INDEX IF NOT EXISTS event_bindings_history_event_id
  ON event_bindings_history(event_id);

COMMIT;
