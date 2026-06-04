-- live_timers 的 FK 约束过严：OB getTimer 返回全量比赛，
-- 大部分 MatchID 不在 platform_matches 里，导致整批 upsert 失败。
-- live_timers 是独立的比赛状态快照，不需要强制关联 platform_matches。

ALTER TABLE live_timers
  DROP CONSTRAINT IF EXISTS live_timers_platform_source_match_id_fkey;
