-- ============================================================
-- 简化：所有用户数据合并到 profiles.config（单表方案）
-- accounts 和 user_settings 表废弃
-- ============================================================

-- 给 profiles 加 config 列（存放 accounts + settings 等所有用户数据）
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS config jsonb NOT NULL DEFAULT '{}';

-- 删除旧 setting 列（数据已迁入 config）
ALTER TABLE profiles DROP COLUMN IF EXISTS setting;

-- 删除旧表
DROP TABLE IF EXISTS accounts CASCADE;
DROP TABLE IF EXISTS user_settings CASCADE;

-- ============================================================
-- 更新 RLS：profiles 允许用户读写自己的完整行
-- ============================================================
DROP POLICY IF EXISTS "profiles: own select" ON profiles;
DROP POLICY IF EXISTS "profiles: own update" ON profiles;

CREATE POLICY "profiles: own all"
  ON profiles
  FOR ALL
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ============================================================
-- 更新 trigger：新用户初始化空 config
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, user_name, config, created_at, updated_at)
  VALUES (
    new.id,
    split_part(new.email, '@', 1),
    '{}',
    (extract(epoch from now()) * 1000)::bigint,
    (extract(epoch from now()) * 1000)::bigint
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;
