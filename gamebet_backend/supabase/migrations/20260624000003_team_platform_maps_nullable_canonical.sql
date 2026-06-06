-- canonical_id 改为可空，允许存储尚未关联到 canonical_teams 的平台队伍记录。
-- 未识别队伍先以 canonical_id = NULL 入库，待 canonical_teams 补充后重跑爬虫回填。
ALTER TABLE team_platform_maps
  ALTER COLUMN canonical_id DROP NOT NULL;
