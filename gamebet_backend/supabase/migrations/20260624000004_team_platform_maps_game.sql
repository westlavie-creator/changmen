-- 添加 game 字段，记录队伍所属游戏（lol / cs2 / dota2 / valorant / kog 等）。
-- canonical_id 有值时 game 可从 canonical_teams JOIN 推导，
-- canonical_id 为 NULL 时 game 是回填时精确匹配的唯一依据。
ALTER TABLE team_platform_maps ADD COLUMN IF NOT EXISTS game text;
