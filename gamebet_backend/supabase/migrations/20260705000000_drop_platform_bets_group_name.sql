-- A8 SaveBet 仅 12 字段；group_name 为 changmen 扩展列，RAY 组名已编码在 bet_name（如 [全场] 获胜者）
ALTER TABLE platform_bets
  DROP COLUMN IF EXISTS group_name;
