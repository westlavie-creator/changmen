-- canonical_teams.canonical_id 仅手动连线有值；team_platform_maps 外键改回指向 canonical_teams.id

ALTER TABLE team_platform_maps
  DROP CONSTRAINT IF EXISTS team_platform_maps_canonical_id_fkey;

DROP TRIGGER IF EXISTS canonical_teams_before_insert_trg ON canonical_teams;
DROP FUNCTION IF EXISTS canonical_teams_before_insert();

ALTER TABLE canonical_teams
  ALTER COLUMN canonical_id DROP NOT NULL;

UPDATE canonical_teams
SET canonical_id = NULL
WHERE updated_by IS DISTINCT FROM '手动';

DROP INDEX IF EXISTS canonical_teams_canonical_id_uidx;
CREATE UNIQUE INDEX canonical_teams_canonical_id_uidx
  ON canonical_teams (canonical_id)
  WHERE canonical_id IS NOT NULL;

ALTER TABLE team_platform_maps
  ADD CONSTRAINT team_platform_maps_canonical_id_fkey
  FOREIGN KEY (canonical_id) REFERENCES canonical_teams (id) ON DELETE CASCADE;

SELECT setval(
  'canonical_teams_manual_id_seq',
  GREATEST(
    COALESCE((SELECT MAX(canonical_id) FROM canonical_teams WHERE canonical_id >= 100000), 99999),
    100000
  )
);
