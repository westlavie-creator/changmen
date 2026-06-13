-- users.is_admin：管理员标志（替代 ADMIN_USERNAMES 环境变量白名单）
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

UPDATE users
SET is_admin = true, updated_at = GREATEST(updated_at, (extract(epoch from now()) * 1000)::bigint)
WHERE lower(user_name) IN ('admin', 'tj01');
