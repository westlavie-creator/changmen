-- SaveBet 持久化 RAY 选项 ID，供 rebuild Sources.HomeID/AwayID 与 fo 对齐
ALTER TABLE platform_bets
  ADD COLUMN IF NOT EXISTS source_home_id text,
  ADD COLUMN IF NOT EXISTS source_away_id text;

COMMENT ON COLUMN platform_bets.source_home_id IS '源站主胜选项 ID（SaveBet SourceHomeID）';
COMMENT ON COLUMN platform_bets.source_away_id IS '源站客胜选项 ID（SaveBet SourceAwayID）';
