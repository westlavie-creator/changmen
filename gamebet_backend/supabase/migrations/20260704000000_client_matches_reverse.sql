-- client_matches：主客颠倒的平台列表（对齐 A8 Reverse[]）
ALTER TABLE client_matches
  ADD COLUMN IF NOT EXISTS reverse jsonb NOT NULL DEFAULT '[]'::jsonb;
