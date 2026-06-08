-- client_matches.id 改为序列自增；merge_key 用于跨 rebuild 识别同一场比赛

ALTER TABLE client_matches ADD COLUMN IF NOT EXISTS merge_key text;

CREATE UNIQUE INDEX IF NOT EXISTS client_matches_merge_key_uidx
  ON client_matches (merge_key)
  WHERE merge_key IS NOT NULL;

CREATE SEQUENCE IF NOT EXISTS client_matches_id_seq;

SELECT setval(
  'client_matches_id_seq',
  GREATEST(COALESCE((SELECT MAX(id) FROM client_matches), 0), 1)
);

ALTER TABLE client_matches
  ALTER COLUMN id SET DEFAULT nextval('client_matches_id_seq');
