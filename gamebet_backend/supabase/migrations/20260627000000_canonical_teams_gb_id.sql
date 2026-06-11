-- canonical_teams.id 改为 text，格式 gb{N}；手动连线创建的新队伍由序列分配

ALTER TABLE team_platform_maps
  DROP CONSTRAINT IF EXISTS team_platform_maps_canonical_id_fkey;

ALTER TABLE canonical_teams ADD COLUMN IF NOT EXISTS id_gb text;
UPDATE canonical_teams
SET id_gb = 'gb' || id::text
WHERE id_gb IS NULL;

ALTER TABLE team_platform_maps ADD COLUMN IF NOT EXISTS canonical_id_gb text;
UPDATE team_platform_maps
SET canonical_id_gb = 'gb' || canonical_id::text
WHERE canonical_id IS NOT NULL AND canonical_id_gb IS NULL;

ALTER TABLE canonical_teams DROP CONSTRAINT IF EXISTS canonical_teams_pkey;
ALTER TABLE canonical_teams DROP COLUMN id;
ALTER TABLE canonical_teams RENAME COLUMN id_gb TO id;
ALTER TABLE canonical_teams ADD PRIMARY KEY (id);

ALTER TABLE team_platform_maps DROP COLUMN canonical_id;
ALTER TABLE team_platform_maps RENAME COLUMN canonical_id_gb TO canonical_id;

ALTER TABLE team_platform_maps
  ADD CONSTRAINT team_platform_maps_canonical_id_fkey
  FOREIGN KEY (canonical_id) REFERENCES canonical_teams (id) ON DELETE CASCADE;

CREATE SEQUENCE IF NOT EXISTS canonical_teams_gb_seq;

SELECT setval(
  'canonical_teams_gb_seq',
  GREATEST(
    COALESCE(
      (
        SELECT MAX(SUBSTRING(id FROM 3)::bigint)
        FROM canonical_teams
        WHERE id ~ '^gb[0-9]+$'
      ),
      0
    ),
    1
  )
);

ALTER TABLE canonical_teams
  ALTER COLUMN id SET DEFAULT ('gb' || nextval('canonical_teams_gb_seq')::text);

GRANT USAGE, SELECT ON SEQUENCE canonical_teams_gb_seq TO service_role;
