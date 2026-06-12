-- ============================================================
-- profiles（对应 Supabase Auth 的 auth.users，id = UUID）
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  user_name   text NOT NULL UNIQUE,
  setting     jsonb NOT NULL DEFAULT '{}',
  created_at  bigint NOT NULL,
  updated_at  bigint NOT NULL
);

-- ============================================================
-- ob_matches（无用户归属，由 service_role 写入）
-- ============================================================
CREATE TABLE IF NOT EXISTS ob_matches (
  source_match_id text    PRIMARY KEY,
  source_game_id  text,
  home            text    NOT NULL,
  home_id         text,
  away            text    NOT NULL,
  away_id         text,
  bo              int,
  start_time      bigint,
  is_live         boolean,
  saved_at        bigint  NOT NULL,
  raw             jsonb   NOT NULL DEFAULT '{}'
);

-- ============================================================
-- client_matches（无用户归属，由 service_role 写入）
-- ============================================================
CREATE TABLE IF NOT EXISTS client_matches (
  id          bigint PRIMARY KEY,
  title       text   NOT NULL,
  game        text,
  game_id     text,
  start_time  bigint,
  bo          int,
  round       int,
  matchs      jsonb,
  bets        jsonb,
  built_at    bigint NOT NULL
);

-- ============================================================
-- 索引
-- ============================================================
CREATE INDEX IF NOT EXISTS ob_matches_game     ON ob_matches(source_game_id);
CREATE INDEX IF NOT EXISTS ob_matches_saved    ON ob_matches(saved_at);
CREATE INDEX IF NOT EXISTS client_matches_game ON client_matches(game_id);
CREATE INDEX IF NOT EXISTS client_matches_time ON client_matches(start_time);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ob_matches     ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles: own select"          ON profiles;
DROP POLICY IF EXISTS "profiles: own update"          ON profiles;
DROP POLICY IF EXISTS "ob_matches: authenticated read"    ON ob_matches;
DROP POLICY IF EXISTS "client_matches: authenticated read" ON client_matches;

CREATE POLICY "profiles: own select"
  ON profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles: own update"
  ON profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "ob_matches: authenticated read"
  ON ob_matches FOR SELECT TO authenticated USING (true);

CREATE POLICY "client_matches: authenticated read"
  ON client_matches FOR SELECT TO authenticated USING (true);

-- ============================================================
-- Trigger：Auth 用户创建后自动在 profiles 插行
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, user_name, setting, created_at, updated_at)
  VALUES (
    new.id,
    split_part(new.email, '@', 1),
    '{}',
    (extract(epoch FROM now()) * 1000)::bigint,
    (extract(epoch FROM now()) * 1000)::bigint
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_auth_user();
