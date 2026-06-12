-- canonical_teams.canonical_id 重命名为 gb_team_id

ALTER TABLE team_platform_maps
  DROP CONSTRAINT IF EXISTS team_platform_maps_canonical_id_fkey;

ALTER TABLE canonical_teams
  RENAME COLUMN canonical_id TO gb_team_id;

DROP INDEX IF EXISTS canonical_teams_canonical_id_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS canonical_teams_gb_team_id_uidx
  ON canonical_teams (gb_team_id);

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
  IF NEW.gb_team_id IS NULL THEN
    NEW.gb_team_id := NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION next_manual_gb_team_id() RETURNS bigint
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT nextval('canonical_teams_manual_id_seq');
$$;

DROP FUNCTION IF EXISTS next_manual_canonical_id();

GRANT EXECUTE ON FUNCTION next_manual_gb_team_id() TO service_role;

SELECT setval(
  'canonical_teams_manual_id_seq',
  GREATEST(
    COALESCE((SELECT MAX(gb_team_id) FROM canonical_teams WHERE gb_team_id >= 100000), 99999),
    100000
  )
);
