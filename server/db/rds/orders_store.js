/**
 * orders 表读写 — upsert、查询、管理端、SaveOrderBind。
 */

import { shouldFireOrderBoundHook } from "../order_link_filter.js";
import { _jsonb, getPgPool } from "./common.js";
import { localDayBounds, localMonthBounds } from "./time_bounds.js";

async function _rdsUpsertOrders(pool, rows) {
  if (!rows?.length)
    return [];
  const sql = `
    INSERT INTO orders (
      user_id, player_id, order_id, link, provider, match, bet, item,
      odds, bet_money, money, status, create_at, raw
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)
    ON CONFLICT (user_id, order_id, player_id) DO UPDATE SET
      link = EXCLUDED.link,
      provider = EXCLUDED.provider,
      match = EXCLUDED.match,
      bet = EXCLUDED.bet,
      item = EXCLUDED.item,
      odds = EXCLUDED.odds,
      bet_money = EXCLUDED.bet_money,
      money = EXCLUDED.money,
      status = EXCLUDED.status,
      create_at = EXCLUDED.create_at,
      raw = EXCLUDED.raw
    RETURNING *, (xmax = 0) AS was_inserted
  `;
  const inserted = [];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const o of rows) {
      const res = await client.query(sql, [
        String(o.user_id),
        Number(o.player_id),
        String(o.order_id),
        o.link != null ? Number(o.link) : null,
        o.provider != null ? String(o.provider) : null,
        o.match != null ? String(o.match) : null,
        o.bet != null ? String(o.bet) : null,
        o.item != null ? String(o.item) : null,
        Number(o.odds) || 0,
        Number(o.bet_money) || 0,
        Number(o.money) || 0,
        String(o.status || "None"),
        Number(o.create_at),
        _jsonb(o.raw, {}),
      ]);
      const row = res.rows?.[0];
      if (row?.was_inserted) {
        const { was_inserted: _wi, ...clean } = row;
        inserted.push(clean);
      }
    }
    await client.query("COMMIT");
    return inserted;
  }
  catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
  finally {
    client.release();
  }
}

/** orders 新行写入后回调（由 backend 注册 Telegram 等） */
let _ordersInsertedHook = null;

export function setOrdersInsertedHook(fn) {
  _ordersInsertedHook = typeof fn === "function" ? fn : null;
}

/** SaveOrderBind 将 link 从外部 hash 改为套利/单边后回调 */
let _ordersBoundHook = null;

export function setOrdersBoundHook(fn) {
  _ordersBoundHook = typeof fn === "function" ? fn : null;
}

/** upsert 订单列表；新插入行经 setOrdersInsertedHook 通知 */
export async function upsertOrders(rows) {
  if (!rows?.length)
    return false;
  const pool = getPgPool();
  if (!pool)
    return false;
  try {
    const inserted = await _rdsUpsertOrders(pool, rows);
    if (inserted.length && _ordersInsertedHook) {
      try {
        _ordersInsertedHook(inserted);
      }
      catch (hookErr) {
        console.warn("[rds] ordersInsertedHook:", hookErr.message);
      }
    }
    return true;
  }
  catch (err) {
    console.warn("[rds] upsertOrders:", err.message);
    return false;
  }
}

/** 按日期读取订单（全量，不做 changmen_bet / link 筛选） */
export async function fetchOrdersByDate(date, userId) {
  const { dayStart, dayEnd } = localDayBounds(date);
  const pool = getPgPool();
  if (!pool || !userId)
    return [];
  try {
    const { rows } = await pool.query(
      `SELECT * FROM orders
       WHERE user_id = $1 AND create_at >= $2 AND create_at < $3
       ORDER BY create_at DESC`,
      [String(userId), dayStart, dayEnd],
    );
    return rows || [];
  }
  catch (err) {
    console.warn("[rds] fetchOrdersByDate:", err.message);
    return [];
  }
}

/** 按 playerId 读取订单（全量） */
export async function fetchOrdersByPlayer(playerId, userId) {
  const pool = getPgPool();
  if (!pool || !userId)
    return [];
  try {
    const { rows } = await pool.query(
      `SELECT * FROM orders
       WHERE user_id = $1 AND player_id = $2
       ORDER BY create_at DESC`,
      [String(userId), Number(playerId)],
    );
    return rows || [];
  }
  catch (err) {
    console.warn("[rds] fetchOrdersByPlayer:", err.message);
    return [];
  }
}

/** saveOrder 读已有行（不过滤，含 A8 被动 sync） */
export async function fetchOrdersByPlayerAll(playerId, userId) {
  const pool = getPgPool();
  if (!pool || !userId)
    return [];
  try {
    const { rows } = await pool.query(
      "SELECT * FROM orders WHERE user_id = $1 AND player_id = $2 ORDER BY create_at DESC",
      [String(userId), Number(playerId)],
    );
    return rows || [];
  }
  catch (err) {
    console.warn("[rds] fetchOrdersByPlayerAll:", err.message);
    return [];
  }
}

/** 运维：同 Link 订单 */
export async function fetchOrdersByLink(userId, link) {
  const pool = getPgPool();
  const uid = String(userId || "").trim();
  const linkVal = Number(link);
  if (!pool || !uid || !Number.isFinite(linkVal) || linkVal === 0)
    return [];
  try {
    const { rows } = await pool.query(
      `SELECT order_id, user_id, player_id, link, provider, match, bet, item,
              odds, bet_money, money, status, create_at
       FROM orders WHERE user_id = $1 AND link = $2
       ORDER BY create_at ASC`,
      [uid, linkVal],
    );
    return rows || [];
  }
  catch (err) {
    console.warn("[rds] fetchOrdersByLink:", err.message);
    return [];
  }
}

/** 按 order_id 查单行 */
export async function fetchOrderByOrderId(userId, orderId) {
  const pool = getPgPool();
  const uid = String(userId || "").trim();
  const oid = String(orderId || "").trim();
  if (!pool || !uid || !oid)
    return null;
  try {
    const { rows } = await pool.query(
      `SELECT order_id, user_id, player_id, link, provider, match, bet, item,
              odds, bet_money, money, status, create_at
       FROM orders WHERE user_id = $1 AND order_id = $2
       LIMIT 1`,
      [uid, oid],
    );
    return rows?.[0] ?? null;
  }
  catch (err) {
    console.warn("[rds] fetchOrderByOrderId:", err.message);
    return null;
  }
}

export async function fetchUserByName(userName) {
  const pool = getPgPool();
  const name = String(userName || "").trim();
  if (!pool || !name)
    return null;
  try {
    const { rows } = await pool.query(
      `SELECT id, user_name FROM users WHERE lower(user_name) = lower($1) LIMIT 1`,
      [name],
    );
    return rows?.[0] ?? null;
  }
  catch (err) {
    console.warn("[rds] fetchUserByName:", err.message);
    return null;
  }
}

export async function fetchUserById(userId) {
  const pool = getPgPool();
  const uid = String(userId || "").trim();
  if (!pool || !uid)
    return null;
  try {
    const { rows } = await pool.query(
      `SELECT id, user_name FROM users WHERE id = $1 LIMIT 1`,
      [uid],
    );
    return rows?.[0] ?? null;
  }
  catch (err) {
    console.warn("[rds] fetchUserById:", err.message);
    return null;
  }
}

/** 管理端：当日订单汇总 */
export async function fetchOrdersAdminStats(dateKey) {
  const { dayStart, dayEnd } = localDayBounds(dateKey);
  const pool = getPgPool();
  if (!pool)
    return { count: 0, money: 0, betMoney: 0 };
  try {
    const { rows } = await pool.query(
      `SELECT money, bet_money, status FROM orders WHERE create_at >= $1 AND create_at < $2`,
      [dayStart, dayEnd],
    );
    let count = 0;
    let money = 0;
    let betMoney = 0;
    for (const o of rows || []) {
      if (String(o.status || "") === "Reject")
        continue;
      count += 1;
      money += Number(o.money) || 0;
      betMoney += Number(o.bet_money) || 0;
    }
    return { count, money, betMoney };
  }
  catch (err) {
    console.warn("[rds] fetchOrdersAdminStats:", err.message);
    return { count: 0, money: 0, betMoney: 0 };
  }
}

/** 管理端：分页订单 */
export async function fetchOrdersAdminPage({
  dateKey,
  userId,
  provider,
  pageIndex,
  pageSize,
  userIds,
}) {
  const { dayStart, dayEnd } = localDayBounds(dateKey);
  const from = (Math.max(1, pageIndex) - 1) * pageSize;
  const pool = getPgPool();
  if (!pool)
    return { rows: [], total: 0 };
  try {
    const params = [dayStart, dayEnd];
    let where = `create_at >= $1 AND create_at < $2`;
    if (userId) {
      params.push(String(userId));
      where += ` AND user_id = $${params.length}`;
    }
    else if (Array.isArray(userIds) && userIds.length) {
      params.push(userIds);
      where += ` AND user_id = ANY($${params.length}::uuid[])`;
    }
    if (provider) {
      params.push(String(provider));
      where += ` AND provider = $${params.length}`;
    }
    const countRes = await pool.query(`SELECT COUNT(*)::int AS n FROM orders WHERE ${where}`, params);
    const total = countRes.rows[0]?.n ?? 0;
    params.push(pageSize, from);
    const { rows } = await pool.query(
      `SELECT * FROM orders WHERE ${where} ORDER BY create_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return { rows: rows || [], total };
  }
  catch (err) {
    console.warn("[rds] fetchOrdersAdminPage:", err.message);
    return { rows: [], total: 0 };
  }
}

/** 管理端：按主键 id 删除订单 */
export async function deleteOrdersByIds(ids) {
  if (!Array.isArray(ids) || !ids.length)
    return 0;
  const pool = getPgPool();
  if (!pool)
    return 0;
  const clean = ids
    .map(id => Number(id))
    .filter(n => Number.isFinite(n) && n > 0);
  if (!clean.length)
    return 0;
  try {
    const res = await pool.query("DELETE FROM orders WHERE id = ANY($1::bigint[])", [clean]);
    return res.rowCount ?? 0;
  }
  catch (err) {
    console.warn("[rds] deleteOrdersByIds:", err.message);
    return 0;
  }
}

/** 管理端：当日全量订单（对阵矩阵，上限 5000 条） */
export async function fetchOrdersAdminAll({ dateKey, provider, limit = 5000, userIds }) {
  const { dayStart, dayEnd } = localDayBounds(dateKey);
  const cap = Math.min(5000, Math.max(1, Number(limit) || 5000));
  const pool = getPgPool();
  if (!pool)
    return [];
  try {
    const params = [dayStart, dayEnd];
    let where = `create_at >= $1 AND create_at < $2`;
    if (Array.isArray(userIds) && userIds.length) {
      params.push(userIds);
      where += ` AND user_id = ANY($${params.length}::uuid[])`;
    }
    if (provider) {
      params.push(String(provider));
      where += ` AND provider = $${params.length}`;
    }
    params.push(cap);
    const { rows } = await pool.query(
      `SELECT * FROM orders WHERE ${where} ORDER BY create_at ASC LIMIT $${params.length}`,
      params,
    );
    return rows || [];
  }
  catch (err) {
    console.warn("[rds] fetchOrdersAdminAll:", err.message);
    return [];
  }
}

/** 月报：读取指定月份订单聚合字段；可选 user_id 筛选 */
export async function fetchOrdersForMonthAggregate(monthKey, userId, userIds) {
  const { monthStart, monthEnd } = localMonthBounds(monthKey);
  const pool = getPgPool();
  if (!pool)
    return [];
  try {
    const params = [monthStart, monthEnd];
    let sql = `SELECT create_at, money, bet_money, status FROM orders WHERE create_at >= $1 AND create_at < $2`;
    if (userId) {
      params.push(String(userId));
      sql += ` AND user_id = $${params.length}`;
    }
    else if (Array.isArray(userIds) && userIds.length) {
      params.push(userIds);
      sql += ` AND user_id = ANY($${params.length}::uuid[])`;
    }
    const { rows } = await pool.query(sql, params);
    return rows || [];
  }
  catch (err) {
    console.warn("[rds] fetchOrdersForMonthAggregate:", err.message);
    return [];
  }
}

/** 排行榜：按本地自然日读取订单盈利聚合字段 */
export async function fetchOrdersForProfitAggregate(dateKey) {
  const { dayStart, dayEnd } = localDayBounds(dateKey);
  const pool = getPgPool();
  if (!pool)
    return [];
  try {
    const { rows } = await pool.query(
      `SELECT user_id, money, bet_money, status FROM orders WHERE create_at >= $1 AND create_at < $2`,
      [dayStart, dayEnd],
    );
    return rows || [];
  }
  catch (err) {
    console.warn("[rds] fetchOrdersForProfitAggregate:", err.message);
    return [];
  }
}

/**
 * 更新订单 link 绑定。
 * 内部 SELECT 不过滤 link（需匹配占位行后再写 bind link）。
 */
function buildOrderBindMatch(userId, orderId, opts = {}) {
  const playerId = Number(opts.playerId);
  const provider = opts.provider ? String(opts.provider) : "";
  const params = [String(userId), String(orderId)];
  const parts = ["user_id = $1", "order_id = $2"];
  if (Number.isFinite(playerId) && playerId > 0) {
    params.push(playerId);
    parts.push(`player_id = $${params.length}`);
  }
  else if (provider) {
    params.push(provider);
    parts.push(`provider = $${params.length}`);
  }
  return { where: parts.join(" AND "), params };
}

/** UPDATE SET link = $1 时，WHERE 占位符整体 +1 */
function offsetSqlPlaceholders(clause, offset) {
  return clause.replace(/\$(\d+)/g, (_, n) => `$${Number(n) + offset}`);
}

export async function updateOrderBind(orderId, userId, link, opts = {}) {
  if (!orderId || !userId)
    return false;
  const linkVal = Number(link) || 0;
  const pool = getPgPool();
  if (!pool)
    return false;
  try {
    const { where, params } = buildOrderBindMatch(userId, orderId, opts);
    const sel = await pool.query(`SELECT * FROM orders WHERE ${where}`, params);
    const prev = sel.rows?.[0];
    if (!prev)
      return false;
    const updateWhere = offsetSqlPlaceholders(where, 1);
    const res = await pool.query(
      `UPDATE orders SET link = $1 WHERE ${updateWhere}`,
      [linkVal, ...params],
    );
    if (res.rowCount > 0 && shouldFireOrderBoundHook(prev, linkVal) && _ordersBoundHook) {
      try {
        _ordersBoundHook([{ ...prev, link: linkVal }]);
      }
      catch (hookErr) {
        console.warn("[rds] ordersBoundHook:", hookErr.message);
      }
    }
    return res.rowCount > 0;
  }
  catch (err) {
    console.warn(
      "[rds] updateOrderBind:",
      err.message,
      `| orderId=${orderId} userId=${userId} link=${link} linkVal=${linkVal}`,
      `| opts=${JSON.stringify(opts)}`,
    );
    return false;
  }
}

function appendUserIdsFilter(params, userIds) {
  if (!Array.isArray(userIds) || !userIds.length)
    return "";
  params.push(userIds);
  return ` AND user_id = ANY($${params.length}::uuid[])`;
}

/** 数据分析：按平台聚合盈亏统计 */
export async function fetchPlatformAnalytics(startMs, endMs, userIds) {
  const pool = getPgPool();
  if (!pool)
    return [];
  try {
    const params = [startMs, endMs];
    const uf = appendUserIdsFilter(params, userIds);
    const { rows } = await pool.query(
      `SELECT provider,
        COUNT(*)::int AS total_orders,
        COUNT(*) FILTER (WHERE status = 'Win')::int AS wins,
        COUNT(*) FILTER (WHERE status = 'Lose')::int AS losses,
        COUNT(*) FILTER (WHERE status = 'Reject')::int AS rejects,
        COUNT(*) FILTER (WHERE status = 'None')::int AS pending,
        COALESCE(SUM(bet_money), 0)::float AS total_bet,
        COALESCE(SUM(money), 0)::float AS total_profit
       FROM orders
       WHERE create_at >= $1 AND create_at < $2 AND provider IS NOT NULL AND provider != ''${uf}
       GROUP BY provider
       ORDER BY total_orders DESC`,
      params,
    );
    return rows || [];
  }
  catch (err) {
    console.warn("[rds] fetchPlatformAnalytics:", err.message);
    return [];
  }
}

/** 数据分析：套利配对统计（按 link 配对两腿，含 9999 单边负 link） */
export async function fetchArbPairAnalytics(startMs, endMs, userIds) {
  const pool = getPgPool();
  if (!pool)
    return [];
  try {
    const params = [startMs, endMs];
    const uf = appendUserIdsFilter(params, userIds);
    const { rows } = await pool.query(
      `WITH pairs AS (
        SELECT
          a.provider AS provider_a, b.provider AS provider_b,
          a.status AS status_a, b.status AS status_b,
          a.money AS money_a, b.money AS money_b,
          a.bet_money AS bet_a, b.bet_money AS bet_b
        FROM orders a
        JOIN orders b ON ABS(a.link) = ABS(b.link)
          AND a.provider < b.provider
          AND a.user_id = b.user_id
        WHERE ABS(a.link) >= 1000000000000
          AND a.create_at >= $1 AND a.create_at < $2${uf ? uf.replace("user_id", "a.user_id") : ""}
      )
      SELECT
        provider_a, provider_b,
        COUNT(*)::int AS pair_count,
        COUNT(*) FILTER (WHERE status_a = 'Win' AND status_b = 'Win')::int AS both_win,
        COUNT(*) FILTER (WHERE status_a != 'Reject' AND status_b != 'Reject')::int AS both_settled,
        COUNT(*) FILTER (WHERE status_a = 'Reject' OR status_b = 'Reject')::int AS has_reject,
        COALESCE(SUM(money_a + money_b), 0)::float AS net_profit,
        COALESCE(SUM(bet_a + bet_b), 0)::float AS total_bet
      FROM pairs
      GROUP BY provider_a, provider_b
      ORDER BY pair_count DESC`,
      params,
    );
    return rows || [];
  }
  catch (err) {
    console.warn("[rds] fetchArbPairAnalytics:", err.message);
    return [];
  }
}

/** 数据分析：按游戏维度聚合（通过 match 名关联 client_matches.game） */
export async function fetchGameAnalytics(startMs, endMs, userIds) {
  const pool = getPgPool();
  if (!pool)
    return [];
  try {
    const params = [startMs, endMs];
    const uf = appendUserIdsFilter(params, userIds);
    const { rows } = await pool.query(
      `SELECT
        COALESCE(cm.game, '未知') AS game,
        COUNT(*)::int AS total_orders,
        COUNT(*) FILTER (WHERE o.status = 'Win')::int AS wins,
        COUNT(*) FILTER (WHERE o.status = 'Lose')::int AS losses,
        COUNT(*) FILTER (WHERE o.status = 'Reject')::int AS rejects,
        COALESCE(SUM(o.bet_money), 0)::float AS total_bet,
        COALESCE(SUM(o.money), 0)::float AS total_profit
       FROM orders o
       LEFT JOIN LATERAL (
         SELECT game FROM client_matches
         WHERE title = o.match
         LIMIT 1
       ) cm ON true
       WHERE o.create_at >= $1 AND o.create_at < $2
         AND o.provider IS NOT NULL AND o.provider != ''${uf ? uf.replace("user_id", "o.user_id") : ""}
       GROUP BY COALESCE(cm.game, '未知')
       ORDER BY total_orders DESC`,
      params,
    );
    return rows || [];
  }
  catch (err) {
    console.warn("[rds] fetchGameAnalytics:", err.message);
    return [];
  }
}

/** 数据分析：按小时聚合（时段分布） */
export async function fetchHourlyAnalytics(startMs, endMs, userIds) {
  const pool = getPgPool();
  if (!pool)
    return [];
  try {
    const params = [startMs, endMs];
    const uf = appendUserIdsFilter(params, userIds);
    const { rows } = await pool.query(
      `SELECT
        EXTRACT(HOUR FROM to_timestamp(create_at / 1000.0))::int AS hour,
        COUNT(*)::int AS total_orders,
        COUNT(*) FILTER (WHERE status = 'Win')::int AS wins,
        COUNT(*) FILTER (WHERE status = 'Lose')::int AS losses,
        COALESCE(SUM(money), 0)::float AS total_profit,
        COALESCE(SUM(bet_money), 0)::float AS total_bet
       FROM orders
       WHERE create_at >= $1 AND create_at < $2
         AND provider IS NOT NULL AND provider != ''${uf}
       GROUP BY hour
       ORDER BY hour`,
      params,
    );
    return rows || [];
  }
  catch (err) {
    console.warn("[rds] fetchHourlyAnalytics:", err.message);
    return [];
  }
}

const OB_ARB_ODDS_BUCKET_SQL = `CASE
  WHEN ob.odds < 1.5 THEN '1.00-1.49'
  WHEN ob.odds < 2.0 THEN '1.50-1.99'
  WHEN ob.odds < 2.5 THEN '2.00-2.49'
  WHEN ob.odds < 3.0 THEN '2.50-2.99'
  WHEN ob.odds < 4.0 THEN '3.00-3.99'
  WHEN ob.odds < 6.0 THEN '4.00-5.99'
  ELSE '6.00+'
END`;

/** 数据分析：OB 套利腿 vs 其他平台 — 按赢/输分组的 OB 赔率分布 */
export async function fetchObArbOddsAnalytics(startMs, endMs, userIds) {
  const pool = getPgPool();
  if (!pool)
    return { buckets: [], summary: [] };
  try {
    const params = [startMs, endMs];
    const uf = appendUserIdsFilter(params, userIds);
    const userFilter = uf ? uf.replace(/\buser_id\b/g, "ob.user_id") : "";
    const baseJoin = `
      FROM orders ob
      JOIN orders other ON ABS(ob.link) = ABS(other.link)
        AND ob.user_id = other.user_id
        AND ob.id <> other.id
        AND ob.provider = 'OB'
        AND other.provider <> 'OB'
      WHERE ABS(ob.link) >= 1000000000000
        AND ob.create_at >= $1 AND ob.create_at < $2
        AND ob.status IN ('Win', 'Lose')${userFilter}`;
    const { rows: buckets } = await pool.query(
      `SELECT
        other.provider AS other_provider,
        ob.status AS ob_status,
        ${OB_ARB_ODDS_BUCKET_SQL} AS ob_odds_bucket,
        COUNT(*)::int AS count,
        AVG(ob.odds)::float AS avg_ob_odds,
        AVG(other.odds)::float AS avg_other_odds
      ${baseJoin}
      GROUP BY other.provider, ob.status, ob_odds_bucket
      ORDER BY other.provider, ob.status, ob_odds_bucket`,
      params,
    );
    const { rows: summary } = await pool.query(
      `SELECT
        other.provider AS other_provider,
        ob.status AS ob_status,
        COUNT(*)::int AS count,
        AVG(ob.odds)::float AS avg_ob_odds,
        AVG(other.odds)::float AS avg_other_odds,
        MIN(ob.odds)::float AS min_ob_odds,
        MAX(ob.odds)::float AS max_ob_odds
      ${baseJoin}
      GROUP BY other.provider, ob.status
      ORDER BY other.provider, ob.status`,
      params,
    );
    return { buckets: buckets || [], summary: summary || [] };
  }
  catch (err) {
    console.warn("[rds] fetchObArbOddsAnalytics:", err.message);
    return { buckets: [], summary: [] };
  }
}

/** 数据分析：按账号（player_id）聚合 */
export async function fetchAccountAnalytics(startMs, endMs, userIds) {
  const pool = getPgPool();
  if (!pool)
    return [];
  try {
    const params = [startMs, endMs];
    const uf = appendUserIdsFilter(params, userIds);
    const { rows } = await pool.query(
      `SELECT
        o.player_id,
        o.provider,
        COUNT(*)::int AS total_orders,
        COUNT(*) FILTER (WHERE o.status = 'Win')::int AS wins,
        COUNT(*) FILTER (WHERE o.status = 'Lose')::int AS losses,
        COUNT(*) FILTER (WHERE o.status = 'Reject')::int AS rejects,
        COALESCE(SUM(o.bet_money), 0)::float AS total_bet,
        COALESCE(SUM(o.money), 0)::float AS total_profit
       FROM orders o
       WHERE o.create_at >= $1 AND o.create_at < $2
         AND o.provider IS NOT NULL AND o.provider != ''${uf ? uf.replace("user_id", "o.user_id") : ""}
       GROUP BY o.player_id, o.provider
       ORDER BY total_profit DESC`,
      params,
    );
    return rows || [];
  }
  catch (err) {
    console.warn("[rds] fetchAccountAnalytics:", err.message);
    return [];
  }
}
