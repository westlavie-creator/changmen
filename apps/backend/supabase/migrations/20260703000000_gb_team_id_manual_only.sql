-- gb_team_id 仅手动匹配有值；team_platform_maps.canonical_id 仅指向手动 gb_team_id（可空）

ALTER TABLE team_platform_maps
  DROP CONSTRAINT IF EXISTS team_platform_maps_canonical_id_fkey;

-- 先清 maps：只保留指向「手动」canonical 行的映射
UPDATE team_platform_maps tpm
SET canonical_id = NULL
WHERE tpm.canonical_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM canonical_teams ct
    WHERE ct.gb_team_id = tpm.canonical_id
      AND ct.updated_by = '手动'
  );

ALTER TABLE canonical_teams
  ALTER COLUMN gb_team_id DROP NOT NULL;

UPDATE canonical_teams
SET gb_team_id = NULL
WHERE updated_by IS DISTINCT FROM '手动';

DROP INDEX IF EXISTS canonical_teams_gb_team_id_uidx;
ALTER TABLE canonical_teams DROP CONSTRAINT IF EXISTS canonical_teams_gb_team_id_key;
ALTER TABLE canonical_teams
  ADD CONSTRAINT canonical_teams_gb_team_id_key UNIQUE (gb_team_id);

ALTER TABLE team_platform_maps
  ALTER COLUMN canonical_id DROP NOT NULL;

ALTER TABLE team_platform_maps
  ADD CONSTRAINT team_platform_maps_canonical_id_fkey
  FOREIGN KEY (canonical_id) REFERENCES canonical_teams (gb_team_id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION canonical_teams_before_insert()
RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  IF NEW.id IS NULL THEN
    NEW.id := nextval('canonical_teams_id_seq');
  END IF;
  RETURN NEW;
END;
$$;

SELECT setval(
  'canonical_teams_manual_id_seq',
  GREATEST(
    COALESCE((SELECT MAX(gb_team_id) FROM canonical_teams WHERE gb_team_id >= 100000), 99999),
    100000
  )
);
