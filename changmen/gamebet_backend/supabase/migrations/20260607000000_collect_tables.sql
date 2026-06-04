-- ============================================================
-- platform_matches：各平台原始比赛（SaveMatch 写入）
-- match_id 初始为 NULL，匹配脚本填入后指向 client_matches
-- ============================================================
CREATE TABLE IF NOT EXISTS platform_matches (
  platform        text      NOT NULL,
  source_match_id text      NOT NULL,
  match_id        bigint    REFERENCES client_matches(id) ON DELETE SET NULL,
  source_game_id  text,
  start_time      bigint,
  home_id         text,
  home            text      NOT NULL,
  away_id         text,
  away            text      NOT NULL,
  bo              smallint,
  teams           jsonb     NOT NULL DEFAULT '[]',
  synced_at       bigint    NOT NULL,
  PRIMARY KEY (platform, source_match_id)
);

-- ============================================================
-- platform_bets：各平台赔率（SaveBet 写入，upsert 覆盖最新）
-- ============================================================
CREATE TABLE IF NOT EXISTS platform_bets (
  platform        text          NOT NULL,
  source_bet_id   text          NOT NULL,
  source_match_id text          NOT NULL,
  map             smallint      NOT NULL DEFAULT 0,
  bet_name        text          NOT NULL,
  home_odds       numeric(6,4)  NOT NULL,
  away_odds       numeric(6,4)  NOT NULL,
  is_locked       boolean       NOT NULL DEFAULT false,
  updated_at      bigint        NOT NULL,
  PRIMARY KEY (platform, source_bet_id),
  FOREIGN KEY (platform, source_match_id)
    REFERENCES platform_matches(platform, source_match_id) ON DELETE CASCADE
);

-- ============================================================
-- live_timers：比赛计时器（SaveLiveTimer 写入，upsert 覆盖最新）
-- ============================================================
CREATE TABLE IF NOT EXISTS live_timers (
  platform        text      NOT NULL,
  source_match_id text      NOT NULL,
  round           smallint  NOT NULL,
  round_start     bigint    NOT NULL,
  updated_at      bigint    NOT NULL,
  PRIMARY KEY (platform, source_match_id),
  FOREIGN KEY (platform, source_match_id)
    REFERENCES platform_matches(platform, source_match_id) ON DELETE CASCADE
);

-- ============================================================
-- 索引
-- ============================================================
CREATE INDEX IF NOT EXISTS platform_matches_match_id
  ON platform_matches(match_id);

CREATE INDEX IF NOT EXISTS platform_matches_platform
  ON platform_matches(platform);

CREATE INDEX IF NOT EXISTS platform_matches_start_time
  ON platform_matches(start_time);

CREATE INDEX IF NOT EXISTS platform_bets_match
  ON platform_bets(platform, source_match_id);

-- ============================================================
-- RLS（service_role 写入，authenticated 只读）
-- ============================================================
ALTER TABLE platform_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_bets    ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_timers      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_matches: authenticated read"
  ON platform_matches FOR SELECT TO authenticated USING (true);

CREATE POLICY "platform_bets: authenticated read"
  ON platform_bets FOR SELECT TO authenticated USING (true);

CREATE POLICY "live_timers: authenticated read"
  ON live_timers FOR SELECT TO authenticated USING (true);
