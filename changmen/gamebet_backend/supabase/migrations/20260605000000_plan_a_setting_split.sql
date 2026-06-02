-- ============================================================
-- 方案A：把 setting 拆成三个清晰的列
--   betting_config  ← USERCONFIG（投注配置）
--   collect_config  ← CollectConfig（采集开关）
--   preferences     ← 其余 KV（PROXY/Follow/Wallet/Message/GoogleCode）
-- ============================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS betting_config jsonb NOT NULL DEFAULT '{}';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS collect_config jsonb NOT NULL DEFAULT '{}';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferences    jsonb NOT NULL DEFAULT '{}';

-- 从 setting 迁移数据
UPDATE profiles SET
  betting_config = CASE
    WHEN setting->>'USERCONFIG' IS NOT NULL
    THEN (setting->>'USERCONFIG')::jsonb
    ELSE '{}'::jsonb END,
  collect_config = CASE
    WHEN setting->>'CollectConfig' IS NOT NULL
    THEN (setting->>'CollectConfig')::jsonb
    ELSE '{}'::jsonb END,
  preferences = (setting - 'USERCONFIG' - 'CollectConfig')
WHERE setting != '{}';

ALTER TABLE profiles DROP COLUMN IF EXISTS setting;

-- 更新 trigger
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, user_name, accounts, betting_config, collect_config, preferences, created_at, updated_at)
  VALUES (
    new.id,
    split_part(new.email, '@', 1),
    '[]', '{}', '{}', '{}',
    (extract(epoch FROM now()) * 1000)::bigint,
    (extract(epoch FROM now()) * 1000)::bigint
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;
