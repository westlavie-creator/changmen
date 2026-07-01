-- C 档：赛事实体注册表 + 平台绑定真相表（client_matches 仍为物化层，DTO 不变）

BEGIN;

CREATE TABLE IF NOT EXISTS match_events (
  id                  bigint PRIMARY KEY,
  title               text NOT NULL DEFAULT '',
  game                text,
  game_id             text,
  start_time          bigint,
  bo                  integer DEFAULT 0,
  pairing_tier        text,
  pairing_confidence  real,
  event_anchor        text,
  home_gb_team_id     bigint,
  away_gb_team_id     bigint,
  built_at            bigint NOT NULL DEFAULT 0,
  updated_at          bigint NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS match_events_start_time ON match_events(start_time);
CREATE INDEX IF NOT EXISTS match_events_pairing_tier ON match_events(pairing_tier);
CREATE INDEX IF NOT EXISTS match_events_event_anchor ON match_events(event_anchor)
  WHERE event_anchor IS NOT NULL;

COMMENT ON TABLE match_events IS
  '稳定赛事实体；id 与 client_matches.id 对齐，供配对真相与运维查询';
COMMENT ON COLUMN match_events.event_anchor IS '主轴场次，如 OB:12345';

CREATE TABLE IF NOT EXISTS event_bindings (
  platform            text NOT NULL,
  source_match_id     text NOT NULL,
  event_id            bigint NOT NULL REFERENCES match_events(id) ON DELETE CASCADE,
  binding_confidence  real,
  binding_source      text,
  binding_side_mode   text,
  bound_at            bigint,
  PRIMARY KEY (platform, source_match_id)
);

CREATE INDEX IF NOT EXISTS event_bindings_event_id ON event_bindings(event_id);
CREATE INDEX IF NOT EXISTS event_bindings_source ON event_bindings(binding_source);

COMMENT ON TABLE event_bindings IS
  '平台场次 → 赛事实体绑定真相；与 platform_matches.binding_* 双写';

-- 从现网回填（幂等）
INSERT INTO match_events (
  id, title, game, game_id, start_time, bo,
  pairing_tier, pairing_confidence, event_anchor,
  home_gb_team_id, away_gb_team_id, built_at, updated_at
)
SELECT
  id, title, game, game_id, start_time, bo,
  pairing_tier, pairing_confidence, event_anchor,
  home_gb_team_id, away_gb_team_id, built_at, built_at
FROM client_matches
ON CONFLICT (id) DO NOTHING;

INSERT INTO event_bindings (
  platform, source_match_id, event_id,
  binding_confidence, binding_source, binding_side_mode, bound_at
)
SELECT
  platform, source_match_id, match_id,
  binding_confidence, binding_source, binding_side_mode, bound_at
FROM platform_matches
WHERE match_id IS NOT NULL
ON CONFLICT (platform, source_match_id) DO NOTHING;

COMMIT;
