-- canonical_teams 增加业务主键 canonical_id；team_platform_maps 外键改指向该字段

ALTER TABLE team_platform_maps
  DROP CONSTRAINT IF EXISTS team_platform_maps_canonical_id_fkey;

ALTER TABLE canonical_teams
  ADD COLUMN IF NOT EXISTS canonical_id bigint;

UPDATE canonical_teams
SET canonical_id = id
WHERE canonical_id IS NULL;

ALTER TABLE canonical_teams
  ALTER COLUMN canonical_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS canonical_teams_canonical_id_uidx
  ON canonical_teams (canonical_id);

ALTER TABLE team_platform_maps
  ADD CONSTRAINT team_platform_maps_canonical_id_fkey
  FOREIGN KEY (canonical_id) REFERENCES canonical_teams (canonical_id) ON DELETE CASCADE;

-- 自动创建：未指定 canonical_id 时默认等于内部 id；手动创建可显式传入 >=100000
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
  'canonical_teams_manual_id_seq',
  GREATEST(
    COALESCE((SELECT MAX(canonical_id) FROM canonical_teams WHERE canonical_id >= 100000), 99999),
    100000
  )
);

SELECT setval(
  'canonical_teams_id_seq',
  GREATEST(COALESCE((SELECT MAX(id) FROM canonical_teams), 0), 1)
);
