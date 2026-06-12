-- platform_bets 的 FK 约束过严：saveBets 的 matchId 可能不在
-- platform_matches 里（时间过滤或采集顺序问题），导致整批 upsert 失败。

ALTER TABLE platform_bets
  DROP CONSTRAINT IF EXISTS platform_bets_platform_source_match_id_fkey;
