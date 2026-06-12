-- platform_bets 保留 RAY 等平台的 GroupName，供 rebuild 识别 match_winner
ALTER TABLE platform_bets
  ADD COLUMN IF NOT EXISTS group_name text;

COMMENT ON COLUMN platform_bets.group_name IS
  '源站盘口组名（SaveBet GroupName），RAY 为「获胜者」';
