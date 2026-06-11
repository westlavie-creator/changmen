-- 撤销「全体 gb 主键」：id 恢复 bigint；gb_id 仅标记手动连线创建的队伍

ALTER TABLE team_platform_maps
  DROP CONSTRAINT IF EXISTS team_platform_maps_canonical_id_fkey;

-- canonical_teams: text id → bigint
ALTER TABLE canonical_teams ADD COLUMN IF NOT EXISTS id_num bigint;
UPDATE canonical_teams
SET id_num = SUBSTRING(id FROM 3)::bigint
WHERE id_num IS NULL AND id ~ '^gb[0-9]+$';

ALTER TABLE canonical_teams DROP CONSTRAINT IF EXISTS canonical_teams_pkey;
ALTER TABLE canonical_teams ALTER COLUMN id DROP DEFAULT;
ALTER TABLE canonical_teams DROP COLUMN id;
ALTER TABLE canonical_teams RENAME COLUMN id_num TO id;
ALTER TABLE canonical_teams ALTER COLUMN id SET NOT NULL;
ALTER TABLE canonical_teams ADD PRIMARY KEY (id);

CREATE SEQUENCE IF NOT EXISTS canonical_teams_id_seq;
SELECT setval(
  'canonical_teams_id_seq',
  GREATEST(COALESCE((SELECT MAX(id) FROM canonical_teams), 0), 1)
);
ALTER TABLE canonical_teams
  ALTER COLUMN id SET DEFAULT nextval('canonical_teams_id_seq');

-- 手动连线专用展示 ID（nullable）
ALTER TABLE canonical_teams ADD COLUMN IF NOT EXISTS gb_id text;
CREATE UNIQUE INDEX IF NOT EXISTS canonical_teams_gb_id_uidx
  ON canonical_teams (gb_id)
  WHERE gb_id IS NOT NULL;

-- team_platform_maps: text canonical_id → bigint
ALTER TABLE team_platform_maps ADD COLUMN IF NOT EXISTS canonical_id_num bigint;
UPDATE team_platform_maps
SET canonical_id_num = SUBSTRING(canonical_id FROM 3)::bigint
WHERE canonical_id_num IS NULL
  AND canonical_id IS NOT NULL
  AND canonical_id ~ '^gb[0-9]+$';

ALTER TABLE team_platform_maps DROP COLUMN canonical_id;
ALTER TABLE team_platform_maps RENAME COLUMN canonical_id_num TO canonical_id;

ALTER TABLE team_platform_maps
  ADD CONSTRAINT team_platform_maps_canonical_id_fkey
  FOREIGN KEY (canonical_id) REFERENCES canonical_teams (id) ON DELETE CASCADE;

-- gb 序列仅给手动连线分配 gb_id，不再作为 canonical_teams.id 默认值
DROP SEQUENCE IF EXISTS canonical_teams_gb_seq CASCADE;
CREATE SEQUENCE canonical_teams_gb_seq START WITH 1;

CREATE OR REPLACE FUNCTION next_manual_gb_id() RETURNS text
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT 'gb' || nextval('canonical_teams_gb_seq')::text;
$$;

GRANT USAGE, SELECT ON SEQUENCE canonical_teams_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE canonical_teams_gb_seq TO service_role;
GRANT EXECUTE ON FUNCTION next_manual_gb_id() TO service_role;
