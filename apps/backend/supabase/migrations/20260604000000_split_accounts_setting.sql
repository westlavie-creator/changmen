-- ============================================================
-- 拆分 config：accounts 独立为列，config 改名为 setting
-- ============================================================

-- 1. 新增 accounts 列
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS accounts jsonb NOT NULL DEFAULT '[]';

-- 2. 把 config.ACCOUNT（JSON 字符串）迁移到 accounts 列
UPDATE profiles
SET accounts = CASE
  WHEN config->>'ACCOUNT' IS NOT NULL AND config->>'ACCOUNT' != 'null'
  THEN (config->>'ACCOUNT')::jsonb
  ELSE '[]'::jsonb
END
WHERE config != '{}';

-- 3. config 列去掉 ACCOUNT key，剩余内容作为 setting
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS setting jsonb NOT NULL DEFAULT '{}';

UPDATE profiles
SET setting = config - 'ACCOUNT'
WHERE config != '{}';

-- 4. 删除旧 config 列
ALTER TABLE profiles DROP COLUMN IF EXISTS config;

-- 5. 更新 trigger，初始化新结构
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, user_name, accounts, setting, created_at, updated_at)
  VALUES (
    new.id,
    split_part(new.email, '@', 1),
    '[]',
    '{}',
    (extract(epoch FROM now()) * 1000)::bigint,
    (extract(epoch FROM now()) * 1000)::bigint
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;
