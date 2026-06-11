-- team_platform_maps.canonical_id 外键改指向 canonical_teams.canonical_id

ALTER TABLE team_platform_maps
  DROP CONSTRAINT IF EXISTS team_platform_maps_canonical_id_fkey;

-- 自动队伍：canonical_id 默认等于 id；手动队伍保留 100000+
UPDATE canonical_teams
SET canonical_id = id
WHERE canonical_id IS NULL;

-- 映射表当前存的是 teams.id，改存 teams.canonical_id
UPDATE team_platform_maps tpm
SET canonical_id = ct.canonical_id
FROM canonical_teams ct
WHERE tpm.canonical_id = ct.id;

ALTER TABLE canonical_teams
  ALTER COLUMN canonical_id SET NOT NULL;

DROP INDEX IF EXISTS canonical_teams_canonical_id_uidx;
CREATE UNIQUE INDEX canonical_teams_canonical_id_uidx
  ON canonical_teams (canonical_id);

ALTER TABLE team_platform_maps
  ADD CONSTRAINT team_platform_maps_canonical_id_fkey
  FOREIGN KEY (canonical_id) REFERENCES canonical_teams (canonical_id) ON DELETE CASCADE;

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
  IF NEW.canonical_id IS NULL THEN
    NEW.canonical_id := NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS canonical_teams_before_insert_trg ON canonical_teams;
CREATE TRIGGER canonical_teams_before_insert_trg
  BEFORE INSERT ON canonical_teams
  FOR EACH ROW
  EXECUTE FUNCTION canonical_teams_before_insert();

SELECT setval(
  'canonical_teams_id_seq',
  GREATEST(COALESCE((SELECT MAX(id) FROM canonical_teams), 0), 1)
);

SELECT setval(
  'canonical_teams_manual_id_seq',
  GREATEST(
    COALESCE((SELECT MAX(canonical_id) FROM canonical_teams WHERE canonical_id >= 100000), 99999),
    100000
  )
);
