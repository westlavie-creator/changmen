-- RAY 等平台 reuse odds_group_id (source_bet_id) across different matches.
-- PK (platform, source_bet_id) caused upsert to steal rows between source_match_id values.
-- Align with in-memory key provider:matchId + per-match SourceBetID (A8 _bets shape).

ALTER TABLE platform_bets
  DROP CONSTRAINT IF EXISTS platform_bets_pkey;

ALTER TABLE platform_bets
  ADD PRIMARY KEY (platform, source_match_id, source_bet_id);
