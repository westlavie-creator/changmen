-- users.role + team_id：三级角色（admin/leader/user）+ 团队分组
BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user';

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS team_id text DEFAULT NULL;

-- 回填：现有管理员 → role='admin'
UPDATE users
SET role = 'admin',
    updated_at = GREATEST(updated_at, (extract(epoch from now()) * 1000)::bigint)
WHERE is_admin = true AND role = 'user';

CREATE INDEX IF NOT EXISTS idx_users_team_id ON users(team_id);

COMMIT;
