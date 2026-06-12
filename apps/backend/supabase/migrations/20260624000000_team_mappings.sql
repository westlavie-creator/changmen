-- ============================================================
-- canonical_teams：每支真实队伍一行
-- ============================================================
CREATE TABLE IF NOT EXISTS canonical_teams (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game          text    NOT NULL,
  name          text    NOT NULL,
  pandascore_id int,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game, name)
);

-- ============================================================
-- team_platform_maps：各平台对该队伍的叫法和 ID
-- ============================================================
CREATE TABLE IF NOT EXISTS team_platform_maps (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  canonical_id  bigint NOT NULL REFERENCES canonical_teams(id) ON DELETE CASCADE,
  platform      text    NOT NULL,
  platform_id   text,
  platform_name text    NOT NULL,
  source        text    NOT NULL DEFAULT 'manual',
  confidence    numeric(3,2) NOT NULL DEFAULT 1.00,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, platform_id),
  UNIQUE (canonical_id, platform, platform_name)
);

CREATE INDEX IF NOT EXISTS team_platform_maps_name_idx
  ON team_platform_maps (platform, platform_name);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE canonical_teams     ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_platform_maps  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "canonical_teams: authenticated read"
  ON canonical_teams FOR SELECT TO authenticated USING (true);

CREATE POLICY "team_platform_maps: authenticated read"
  ON team_platform_maps FOR SELECT TO authenticated USING (true);
