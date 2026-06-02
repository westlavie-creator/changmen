-- ============================================================
-- orders 表：按用户隔离的订单记录
-- ============================================================

CREATE TABLE IF NOT EXISTS orders (
  id         bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id    uuid   NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  player_id  bigint NOT NULL,
  order_id   text   NOT NULL,
  link       bigint,
  provider   text,
  match      text,
  bet        text,
  item       text,
  odds       float  NOT NULL DEFAULT 0,
  bet_money  float  NOT NULL DEFAULT 0,
  money      float  NOT NULL DEFAULT 0,
  status     text   NOT NULL DEFAULT 'None',
  create_at  bigint NOT NULL,
  raw        jsonb  NOT NULL DEFAULT '{}'
);

-- 同一用户同一 order_id 不重复
CREATE UNIQUE INDEX IF NOT EXISTS orders_user_order
  ON orders(user_id, order_id, player_id);

-- 按日期查询加速
CREATE INDEX IF NOT EXISTS orders_user_date
  ON orders(user_id, create_at);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orders: own all"
  ON orders FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
