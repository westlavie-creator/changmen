-- 手动修复：pm/f43e NRG Academy 买单（2026-07-05 05:26:37）
-- 根因：pmAttributedSellShares=36 + pmSellState=open 阻止 Gamma 结算写回
--
-- 使用前请先跑「验证」查询确认只有 1 行且数据吻合。
-- 盈亏：36 份 × $1 − 18 USDC stake = +18 USDC ≈ +126 CNY（multiply=7）

-- === 1. 验证（应返回 1 行）===
SELECT
  o.order_id,
  o.player_id,
  p.user_name,
  o.status,
  o.money,
  o.bet_money,
  o.item,
  to_timestamp(o.create_at / 1000.0) AT TIME ZONE 'Asia/Shanghai' AS create_at_cst,
  o.raw->>'pmShares' AS pm_shares,
  o.raw->>'pmAttributedSellShares' AS pm_attr,
  o.raw->>'pmSellState' AS pm_sell_state
FROM orders o
JOIN profiles p ON p.id = o.user_id
WHERE o.order_id LIKE '0x4a8d25e298ab95e84e%'
  AND o.player_id = 47
  AND o.status = 'None'
  AND o.bet_money = 126;

-- === 2. 修复（确认后再执行）===
BEGIN;

UPDATE orders
SET
  status = 'Win',
  money = 126,
  raw = COALESCE(raw, '{}'::jsonb) || jsonb_build_object(
    'status', 'win',
    'money', 126,
    'pmSellState', 'settled',
    'manualSettlement', jsonb_build_object(
      'at', (extract(epoch FROM now()) * 1000)::bigint,
      'reason', 'nrg-academy: open+full-attr blocked gamma settlement'
    )
  )
WHERE order_id LIKE '0x4a8d25e298ab95e84e%'
  AND player_id = 47
  AND status = 'None'
  AND bet_money = 126;

-- 应显示 UPDATE 1
COMMIT;

-- === 3. 复查 ===
SELECT order_id, status, money, raw->>'pmSellState' AS pm_sell_state
FROM orders
WHERE order_id LIKE '0x4a8d25e298ab95e84e%';
