-- client_matches 补加 round_start 列
-- 用于持久化 OB live timer 的局开始时间，供前端计时展示

ALTER TABLE client_matches ADD COLUMN IF NOT EXISTS round_start bigint NOT NULL DEFAULT 0;
