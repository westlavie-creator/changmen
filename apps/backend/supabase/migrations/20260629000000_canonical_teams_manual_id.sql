-- 去掉 gb_id：手动连线 id 从 100000 自增；updated_by = '手动' 标记来源

ALTER TABLE canonical_teams ADD COLUMN IF NOT EXISTS updated_by text;

UPDATE canonical_teams
SET updated_by = '手动'
WHERE gb_id IS NOT NULL;

ALTER TABLE canonical_teams DROP COLUMN IF EXISTS gb_id;
DROP INDEX IF EXISTS canonical_teams_gb_id_uidx;

DROP FUNCTION IF EXISTS next_manual_gb_id();
DROP SEQUENCE IF EXISTS canonical_teams_gb_seq;

CREATE SEQUENCE IF NOT EXISTS canonical_teams_manual_id_seq START WITH 100000;

SELECT setval(
  'canonical_teams_manual_id_seq',
  GREATEST(
    COALESCE((SELECT MAX(id) FROM canonical_teams WHERE id >= 100000), 99999),
    100000
  )
);

SELECT setval(
  'canonical_teams_id_seq',
  GREATEST(COALESCE((SELECT MAX(id) FROM canonical_teams WHERE id < 100000), 0), 1)
);

CREATE OR REPLACE FUNCTION next_manual_canonical_id() RETURNS bigint
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT nextval('canonical_teams_manual_id_seq');
$$;

GRANT USAGE, SELECT ON SEQUENCE canonical_teams_manual_id_seq TO service_role;
GRANT EXECUTE ON FUNCTION next_manual_canonical_id() TO service_role;
