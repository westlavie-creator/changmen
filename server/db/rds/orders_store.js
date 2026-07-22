/**
 * orders 表读写 — upsert、查询、管理端、SaveOrderBind。
 */

import {
  canRebindLinkNewerToOlder,
  shouldAllowOrderBind,
  shouldFireOrderBoundHook,
} from "../order_link_filter.js";
import { _jsonb, getPgPool } from "./common.js";
import { localDayBounds, localMonthBounds } from "./time_bounds.js";

const UPSERT_ORDERS_BATCH_SQL = `
  INSERT INTO orders (
    user_id, player_id, order_id, link, provider, match, bet, item,
    odds, bet_money, money, status, create_at, raw
  )
  SELECT * FROM unnest(
    $1::uuid[],
    $2::bigint[],
    $3::text[],
    $4::bigint[],
    $5::text[],
    $6::text[],
    $7::text[],
    $8::text[],
    $9::float8[],
    $10::float8[],
    $11::float8[],
    $12::text[],
    $13::bigint[],
    $14::jsonb[]
  ) AS t(
    user_id, player_id, order_id, link, provider, match, bet, item,
    odds, bet_money, money, status, create_at, raw
  )
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

function _orderRowToUpsertArrays(rows) {
  const userIds = [];
  const playerIds = [];
  const orderIds = [];
  const links = [];
  const providers = [];
  const matches = [];
  const bets = [];
  const items = [];
  const oddsList = [];
  const betMoneys = [];
  const moneys = [];
  const statuses = [];
  const createAts = [];
  const raws = [];
  for (const o of rows) {
    userIds.push(String(o.user_id));
    playerIds.push(Number(o.player_id));
    orderIds.push(String(o.order_id));
    links.push(o.link != null ? Number(o.link) : null);
    providers.push(o.provider != null ? String(o.provider) : null);
    matches.push(o.match != null ? String(o.match) : null);
    bets.push(o.bet != null ? String(o.bet) : null);
    items.push(o.item != null ? String(o.item) : null);
    oddsList.push(Number(o.odds) || 0);
    betMoneys.push(Number(o.bet_money) || 0);
    moneys.push(Number(o.money) || 0);
    statuses.push(String(o.status || "None"));
    createAts.push(Number(o.create_at));
    raws.push(JSON.parse(_jsonb(o.raw, {})));
  }
  return [
    userIds,
    playerIds,
    orderIds,
    links,
    providers,
    matches,
    bets,
    items,
    oddsList,
    betMoneys,
    moneys,
    statuses,
    createAts,
    raws,
  ];
}

function _dedupeUpsertRows(rows) {
  const byKey = new Map();
  for (const row of rows) {
    const key = `${row.user_id}\0${row.player_id}\0${row.order_id}`;
    byKey.set(key, row);
  }
  return [...byKey.values()];
}

async function _rdsUpsertOrders(pool, rows) {
  if (!rows?.length)
    return [];
  const deduped = _dedupeUpsertRows(rows);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const res = await client.query(UPSERT_ORDERS_BATCH_SQL, _orderRowToUpsertArrays(deduped));
    await client.query("COMMIT");
    const inserted = [];
    for (const row of res.rows || []) {
      if (row?.was_inserted) {
        const { was_inserted: _wi, ...clean } = row;
        inserted.push(clean);
      }
    }
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

/** Client_GetOrderList：SQL 分页，避免拉取当日全量再在内存 slice */
export async function fetchOrdersByDatePage(date, userId, pageIndex = 1, pageSize = 1024) {
  const { dayStart, dayEnd } = localDayBounds(date);
  const pool = getPgPool();
  if (!pool || !userId)
    return { rows: [], total: 0 };
  const page = Math.max(1, Number(pageIndex) || 1);
  const size = Math.max(1, Math.min(Number(pageSize) || 1024, 5000));
  const offset = (page - 1) * size;
  try {
    const params = [String(userId), dayStart, dayEnd];
    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS n FROM orders
       WHERE user_id = $1 AND create_at >= $2 AND create_at < $3`,
      params,
    );
    const total = countRes.rows[0]?.n ?? 0;
    params.push(size, offset);
    const { rows } = await pool.query(
      `SELECT * FROM orders
       WHERE user_id = $1 AND create_at >= $2 AND create_at < $3
       ORDER BY create_at DESC
       LIMIT $4 OFFSET $5`,
      params,
    );
    return { rows: rows || [], total };
  }
  catch (err) {
    console.warn("[rds] fetchOrdersByDatePage:", err.message);
    return { rows: [], total: 0 };
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

/** saveOrder 合并：只读本次 upsert 涉及的 order_id（及 PM 关联买单） */
export async function fetchOrdersByPlayerOrderIds(playerId, userId, orderIds) {
  const pool = getPgPool();
  if (!pool || !userId || !Array.isArray(orderIds) || !orderIds.length)
    return [];
  const ids = [...new Set(orderIds.map(id => String(id).trim()).filter(Boolean))];
  if (!ids.length)
    return [];
  try {
    const { rows } = await pool.query(
      `SELECT * FROM orders
       WHERE user_id = $1 AND player_id = $2 AND order_id = ANY($3::text[])`,
      [String(userId), Number(playerId), ids],
    );
    return rows || [];
  }
  catch (err) {
    console.warn("[rds] fetchOrdersByPlayerOrderIds:", err.message);
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

/**
 * [changmen 扩展] 按多个 Link 拉全量订单（含跨日）。
 * 用于侧栏按日列表并入同 Link 的买卖腿，避免「昨天买今天卖」拆组。
 */
export async function fetchOrdersByLinks(userId, links) {
  const pool = getPgPool();
  const uid = String(userId || "").trim();
  if (!pool || !uid || !Array.isArray(links) || !links.length)
    return [];
  const linkVals = [...new Set(
    links.map(l => Number(l)).filter(n => Number.isFinite(n) && n !== 0),
  )];
  if (!linkVals.length)
    return [];
  try {
    const { rows } = await pool.query(
      `SELECT * FROM orders
       WHERE user_id = $1 AND link = ANY($2::bigint[])
       ORDER BY create_at DESC`,
      [uid, linkVals],
    );
    return rows || [];
  }
  catch (err) {
    console.warn("[rds] fetchOrdersByLinks:", err.message);
    return [];
  }
}

/**
 * [changmen 扩展] 按 order_id 批量拉单（跨日父买单；大小写不敏感）。
 * @param {string} userId
 * @param {string[]} orderIds
 * @param {string[]|null} [userIds] 管理端多用户时可选缩小范围
 */
export async function fetchOrdersByUserOrderIds(userId, orderIds, userIds = null) {
  const pool = getPgPool();
  const ids = [...new Set(
    (orderIds || []).map(id => String(id ?? "").trim().toLowerCase()).filter(Boolean),
  )];
  if (!pool || !ids.length)
    return [];
  try {
    const params = [ids];
    let where = `lower(order_id) = ANY($1::text[])`;
    const uid = String(userId || "").trim();
    if (uid) {
      params.push(uid);
      where += ` AND user_id = $${params.length}`;
    }
    else if (Array.isArray(userIds) && userIds.length) {
      params.push(userIds.map(String));
      where += ` AND user_id = ANY($${params.length}::uuid[])`;
    }
    const { rows } = await pool.query(
      `SELECT * FROM orders WHERE ${where} ORDER BY create_at DESC`,
      params,
    );
    return rows || [];
  }
  catch (err) {
    console.warn("[rds] fetchOrdersByUserOrderIds:", err.message);
    return [];
  }
}

/**
 * [changmen 扩展] 按父买单 order_id 拉 PM/PF 卖单（不依赖 sell.link）。
 * @param {string} userId
 * @param {string[]} buyOrderIds
 * @param {string[]|null} [userIds]
 */
export async function fetchPredictionSellsByBuyOrderIds(userId, buyOrderIds, userIds = null) {
  const pool = getPgPool();
  const ids = [...new Set(
    (buyOrderIds || []).map(id => String(id ?? "").trim().toLowerCase()).filter(Boolean),
  )];
  if (!pool || !ids.length)
    return [];
  try {
    const params = [ids];
    let where = `(
      lower(COALESCE(raw->>'pmBuyOrderId', '')) = ANY($1::text[])
      OR lower(COALESCE(raw->>'pfBuyOrderId', '')) = ANY($1::text[])
    )`;
    const uid = String(userId || "").trim();
    if (uid) {
      params.push(uid);
      where += ` AND user_id = $${params.length}`;
    }
    else if (Array.isArray(userIds) && userIds.length) {
      params.push(userIds.map(String));
      where += ` AND user_id = ANY($${params.length}::uuid[])`;
    }
    const { rows } = await pool.query(
      `SELECT * FROM orders WHERE ${where} ORDER BY create_at DESC`,
      params,
    );
    return rows || [];
  }
  catch (err) {
    console.warn("[rds] fetchPredictionSellsByBuyOrderIds:", err.message);
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

/** 管理端：当日订单汇总（笔数不计 PM/PF 卖单） */
export async function fetchOrdersAdminStats(dateKey) {
  const { dayStart, dayEnd } = localDayBounds(dateKey);
  const pool = getPgPool();
  if (!pool)
    return { count: 0, money: 0, betMoney: 0 };
  try {
    const { rows } = await pool.query(
      `SELECT money, bet_money, status, provider, raw FROM orders WHERE create_at >= $1 AND create_at < $2`,
      [dayStart, dayEnd],
    );
    let count = 0;
    let money = 0;
    let betMoney = 0;
    for (const o of rows || []) {
      if (String(o.status || "") === "Reject")
        continue;
      money += Number(o.money) || 0;
      betMoney += Number(o.bet_money) || 0;
      const raw = o.raw && typeof o.raw === "object" ? o.raw : {};
      const provider = String(o.provider || "").trim();
      const isSell = (provider === "Polymarket" && String(raw.pmSide || "").toLowerCase() === "sell")
        || (provider === "PredictFun" && String(raw.pfSide || "").toLowerCase() === "sell");
      if (!isSell)
        count += 1;
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
  playerId,
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
    const pid = Number(playerId);
    if (Number.isFinite(pid) && pid > 0) {
      params.push(pid);
      where += ` AND player_id = $${params.length}`;
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

/**
 * 删除 Polymarket 卖单（仅 raw.pmSide = 'sell'，避免误删买单）。
 * @param {{ userId?: string, playerId?: number }} scope 可选范围
 */
export async function deletePolymarketSellOrders(scope = {}) {
  const pool = getPgPool();
  if (!pool)
    return { deleted: 0, ids: [] };
  try {
    const params = [];
    let where = `provider = 'Polymarket' AND raw->>'pmSide' = 'sell'`;
    const userId = scope.userId != null ? String(scope.userId).trim() : "";
    const playerId = Number(scope.playerId);
    if (userId) {
      params.push(userId);
      where += ` AND user_id = $${params.length}::uuid`;
    }
    if (Number.isFinite(playerId) && playerId > 0) {
      params.push(playerId);
      where += ` AND player_id = $${params.length}`;
    }
    const res = await pool.query(
      `DELETE FROM orders WHERE ${where} RETURNING id`,
      params,
    );
    const ids = (res.rows || []).map(r => Number(r.id)).filter(n => Number.isFinite(n) && n > 0);
    return { deleted: res.rowCount ?? 0, ids };
  }
  catch (err) {
    console.warn("[rds] deletePolymarketSellOrders:", err.message);
    return { deleted: 0, ids: [] };
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
    let sql = `SELECT create_at, money, bet_money, status, provider, raw FROM orders WHERE create_at >= $1 AND create_at < $2`;
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
      `SELECT user_id, money, bet_money, status, provider, raw FROM orders WHERE create_at >= $1 AND create_at < $2`,
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
    if (!shouldAllowOrderBind(prev, linkVal)) {
      console.warn(
        "[rds] updateOrderBind: refused cross-arb rebind",
        `| orderId=${orderId} prevLink=${prev.link} nextLink=${linkVal} create_at=${prev.create_at}`,
      );
      return false;
    }
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

/**
 * [changmen 扩展] 用户侧栏手动改绑：单笔 order 的 link 改为 toLink（仅新→老）。
 * 不走 shouldAllowOrderBind。
 * @returns {{ ok: boolean, msg?: string, orderId?: string, fromLinkId?: number, toLinkId?: number }}
 */
export async function rebindOrderLink(userId, orderId, toLinkId) {
  const uid = String(userId || "").trim();
  const oid = String(orderId || "").trim();
  const toLink = Number(toLinkId);
  if (!uid || !oid)
    return { ok: false, msg: "orderId 必填" };
  if (!Number.isFinite(toLink) || toLink === 0)
    return { ok: false, msg: "toLinkId 无效" };

  const pool = getPgPool();
  if (!pool)
    return { ok: false, msg: "数据库不可用" };

  try {
    const prev = await fetchOrderByOrderId(uid, oid);
    if (!prev)
      return { ok: false, msg: "订单不存在" };

    const fromLink = Number(prev.link) || 0;
    if (fromLink === toLink)
      return { ok: true, orderId: oid, fromLinkId: fromLink, toLinkId: toLink };

    if (!canRebindLinkNewerToOlder(fromLink, toLink)) {
      return {
        ok: false,
        msg: "只能把较新的 Link 并入较老的 Link",
        orderId: oid,
        fromLinkId: fromLink,
        toLinkId: toLink,
      };
    }

    const peers = await fetchOrdersByLink(uid, toLink);
    if (!peers.length) {
      return {
        ok: false,
        msg: "目标 Link 下没有本用户订单",
        orderId: oid,
        fromLinkId: fromLink,
        toLinkId: toLink,
      };
    }

    const res = await pool.query(
      `UPDATE orders SET link = $1 WHERE user_id = $2 AND order_id = $3`,
      [toLink, uid, oid],
    );
    if (!(res.rowCount > 0))
      return { ok: false, msg: "更新失败", orderId: oid, fromLinkId: fromLink, toLinkId: toLink };

    console.info(
      "[rds] rebindOrderLink:",
      `| userId=${uid} orderId=${oid} from=${fromLink} to=${toLink}`,
    );
    return { ok: true, orderId: oid, fromLinkId: fromLink, toLinkId: toLink };
  }
  catch (err) {
    console.warn("[rds] rebindOrderLink:", err.message, `| orderId=${oid} to=${toLink}`);
    return { ok: false, msg: err.message || "改绑失败" };
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
        COUNT(*) FILTER (WHERE status_a = 'Reject')::int AS rejects_a,
        COUNT(*) FILTER (WHERE status_b = 'Reject')::int AS rejects_b,
        COALESCE(SUM(money_a + money_b), 0)::float AS net_profit,
        COALESCE(SUM(bet_a + bet_b), 0)::float AS total_bet,
        COUNT(*) FILTER (WHERE status_a = 'Win')::int AS wins_a,
        COUNT(*) FILTER (WHERE status_a = 'Lose')::int AS losses_a,
        COALESCE(SUM(money_a), 0)::float AS profit_a,
        COALESCE(SUM(bet_a), 0)::float AS bet_a,
        COUNT(*) FILTER (WHERE status_b = 'Win')::int AS wins_b,
        COUNT(*) FILTER (WHERE status_b = 'Lose')::int AS losses_b,
        COALESCE(SUM(money_b), 0)::float AS profit_b,
        COALESCE(SUM(bet_b), 0)::float AS bet_b
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

const PM_PRICE_BAND_SQL = `CASE
  WHEN fill_price IS NULL OR fill_price <= 0 THEN 'unknown'
  WHEN fill_price < 0.30 THEN '0.00-0.30'
  WHEN fill_price < 0.50 THEN '0.30-0.50'
  WHEN fill_price < 0.70 THEN '0.50-0.70'
  ELSE '0.70-1.00'
END`;

/**
 * Polymarket Builder：持有到期 / 赛果视角策略分析（全量）。
 * - 样本：时段内 PM 买单且有赛果（raw.pmMatchResult，兼容旧数据 status Win/Lose）
 * - 含中途卖出单；输赢看赛果，不用实际卖出 Money
 * - 理论盈亏：赢 = bet*(odds-1)，输 = -bet（假使持仓到结算）
 * - 价位带 / 对手场馆按上述口径聚合
 */
export async function fetchPolymarketOrderAnalytics(startMs, endMs, userIds) {
  const pool = getPgPool();
  const empty = {
    summary: {
      groupCount: 0,
      arbGroupCount: 0,
      singleLegCount: 0,
      soldCloseCount: 0,
      winCount: 0,
      loseCount: 0,
      winRate: 0,
      totalPmBet: 0,
      totalHoldProfit: 0,
      roi: 0,
    },
    priceBands: [],
    venues: [],
  };
  if (!pool)
    return empty;
  try {
    const params = [startMs, endMs];
    const uf = appendUserIdsFilter(params, userIds);
    const userFilter = uf ? uf.replace(/\buser_id\b/g, "pm.user_id") : "";

    const groupsCte = `
      WITH pm_buys AS (
        SELECT
          pm.user_id,
          ABS(pm.link) AS link_abs,
          pm.bet_money,
          pm.odds,
          COALESCE(
            NULLIF(pm.raw->>'pmFillPrice', '')::float,
            CASE WHEN pm.odds > 1 THEN 1.0 / pm.odds ELSE NULL END
          ) AS fill_price,
          LOWER(COALESCE(pm.raw->>'pmSellState', '')) AS sell_state,
          CASE
            WHEN LOWER(COALESCE(pm.raw->>'pmMatchResult', '')) IN ('win', 'lose')
              THEN LOWER(pm.raw->>'pmMatchResult')
            WHEN LOWER(pm.status) IN ('win', 'lose')
              THEN LOWER(pm.status)
            ELSE NULL
          END AS match_result
        FROM orders pm
        WHERE pm.provider = 'Polymarket'
          AND LOWER(COALESCE(pm.raw->>'pmSide', '')) IS DISTINCT FROM 'sell'
          AND pm.create_at >= $1 AND pm.create_at < $2
          AND pm.link IS NOT NULL
          AND ABS(pm.link) <> 0
          ${userFilter}
      ),
      settled_buys AS (
        SELECT
          *,
          CASE
            WHEN match_result = 'win' AND odds > 1 THEN bet_money * (odds - 1)
            WHEN match_result = 'lose' THEN -bet_money
            ELSE 0
          END AS hold_profit
        FROM pm_buys
        WHERE match_result IN ('win', 'lose')
      ),
      anchors AS (
        SELECT
          user_id,
          link_abs,
          SUM(bet_money)::float AS pm_bet,
          SUM(hold_profit)::float AS hold_profit,
          AVG(fill_price) FILTER (WHERE fill_price IS NOT NULL AND fill_price > 0)::float AS fill_price,
          BOOL_OR(sell_state = 'closed') AS sold_closed,
          -- 同组多条 PM 买单时：全赢才算赢，否则有输算输
          CASE
            WHEN BOOL_AND(match_result = 'win') THEN 'win'
            ELSE 'lose'
          END AS match_result,
          COUNT(*) FILTER (WHERE match_result = 'win')::int AS win_legs,
          COUNT(*) FILTER (WHERE match_result = 'lose')::int AS lose_legs
        FROM settled_buys
        GROUP BY user_id, link_abs
      ),
      groups AS (
        SELECT
          a.user_id,
          a.link_abs,
          a.pm_bet,
          a.hold_profit,
          a.fill_price,
          a.sold_closed,
          a.match_result,
          (a.link_abs >= 1000000000000) AS is_arb_link,
          COUNT(DISTINCT o.provider) FILTER (
            WHERE o.provider IS DISTINCT FROM 'Polymarket'
              AND o.provider IS NOT NULL
              AND o.provider <> ''
          )::int AS other_venue_count
        FROM anchors a
        LEFT JOIN orders o
          ON o.user_id = a.user_id
          AND ABS(o.link) = a.link_abs
        GROUP BY a.user_id, a.link_abs, a.pm_bet, a.hold_profit, a.fill_price,
          a.sold_closed, a.match_result
      )`;

    const { rows: summaryRows } = await pool.query(
      `${groupsCte}
      SELECT
        COUNT(*)::int AS group_count,
        COUNT(*) FILTER (WHERE is_arb_link AND other_venue_count > 0)::int AS arb_group_count,
        COUNT(*) FILTER (WHERE other_venue_count = 0 OR NOT is_arb_link)::int AS single_leg_count,
        COUNT(*) FILTER (WHERE sold_closed)::int AS sold_close_count,
        COUNT(*) FILTER (WHERE match_result = 'win')::int AS win_count,
        COUNT(*) FILTER (WHERE match_result = 'lose')::int AS lose_count,
        COALESCE(SUM(pm_bet), 0)::float AS total_pm_bet,
        COALESCE(SUM(hold_profit), 0)::float AS total_hold_profit
      FROM groups`,
      params,
    );

    const { rows: priceBands } = await pool.query(
      `${groupsCte}
      SELECT
        ${PM_PRICE_BAND_SQL} AS price_band,
        COUNT(*)::int AS group_count,
        COUNT(*) FILTER (WHERE match_result = 'win')::int AS win_count,
        COUNT(*) FILTER (WHERE match_result = 'lose')::int AS lose_count,
        COALESCE(SUM(pm_bet), 0)::float AS pm_bet,
        COALESCE(SUM(hold_profit), 0)::float AS hold_profit,
        AVG(fill_price) FILTER (WHERE fill_price IS NOT NULL AND fill_price > 0)::float AS avg_fill_price
      FROM groups
      GROUP BY price_band
      ORDER BY price_band`,
      params,
    );

    const { rows: venues } = await pool.query(
      `${groupsCte},
      venue_groups AS (
        SELECT
          g.user_id,
          g.link_abs,
          g.pm_bet,
          g.hold_profit,
          g.fill_price,
          g.match_result,
          other.provider AS other_provider
        FROM groups g
        JOIN orders other
          ON other.user_id = g.user_id
          AND ABS(other.link) = g.link_abs
          AND other.provider IS DISTINCT FROM 'Polymarket'
          AND other.provider IS NOT NULL
          AND other.provider <> ''
        WHERE g.is_arb_link
        GROUP BY g.user_id, g.link_abs, g.pm_bet, g.hold_profit, g.fill_price,
          g.match_result, other.provider
      )
      SELECT
        other_provider,
        COUNT(*)::int AS group_count,
        COUNT(*) FILTER (WHERE match_result = 'win')::int AS win_count,
        COUNT(*) FILTER (WHERE match_result = 'lose')::int AS lose_count,
        COALESCE(SUM(pm_bet), 0)::float AS pm_bet,
        COALESCE(SUM(hold_profit), 0)::float AS hold_profit,
        AVG(fill_price) FILTER (WHERE fill_price IS NOT NULL AND fill_price > 0)::float AS avg_fill_price
      FROM venue_groups
      GROUP BY other_provider
      ORDER BY group_count DESC, other_provider`,
      params,
    );

    const mapBandOrVenue = (r) => {
      const pmBet = Number(r.pm_bet) || 0;
      const holdProfit = Number(r.hold_profit) || 0;
      const winCount = Number(r.win_count) || 0;
      const loseCount = Number(r.lose_count) || 0;
      const decided = winCount + loseCount;
      return {
        group_count: Number(r.group_count) || 0,
        win_count: winCount,
        lose_count: loseCount,
        win_rate: decided > 0 ? winCount / decided : 0,
        pm_bet: pmBet,
        hold_profit: holdProfit,
        avg_fill_price: Number(r.avg_fill_price) || 0,
        roi: pmBet > 0 ? holdProfit / pmBet : 0,
      };
    };

    const s = summaryRows?.[0] || {};
    const totalPmBet = Number(s.total_pm_bet) || 0;
    const totalHoldProfit = Number(s.total_hold_profit) || 0;
    const winCount = Number(s.win_count) || 0;
    const loseCount = Number(s.lose_count) || 0;
    const decided = winCount + loseCount;
    return {
      summary: {
        groupCount: Number(s.group_count) || 0,
        arbGroupCount: Number(s.arb_group_count) || 0,
        singleLegCount: Number(s.single_leg_count) || 0,
        soldCloseCount: Number(s.sold_close_count) || 0,
        winCount,
        loseCount,
        winRate: decided > 0 ? winCount / decided : 0,
        totalPmBet,
        totalHoldProfit,
        roi: totalPmBet > 0 ? totalHoldProfit / totalPmBet : 0,
      },
      priceBands: (priceBands || []).map(r => ({
        price_band: r.price_band,
        ...mapBandOrVenue(r),
      })),
      venues: (venues || []).map(r => ({
        other_provider: r.other_provider,
        ...mapBandOrVenue(r),
      })),
    };
  }
  catch (err) {
    console.warn("[rds] fetchPolymarketOrderAnalytics:", err.message);
    return empty;
  }
}

function polymarketOrdersRangeWhere(startMs, endMs, userIds) {
  const params = [startMs, endMs];
  let where = `o.create_at >= $1 AND o.create_at < $2 AND o.provider = 'Polymarket'`;
  if (Array.isArray(userIds) && userIds.length) {
    params.push(userIds);
    where += ` AND o.user_id = ANY($${params.length}::uuid[])`;
  }
  return { params, where };
}

/** Polymarket Builder 看板：时间范围内 changmen Polymarket 订单汇总（不受列表 LIMIT 影响） */
export async function fetchPolymarketOrderStatsInRange(startMs, endMs, userIds) {
  const pool = getPgPool();
  const empty = {
    orderCount: 0,
    totalBet: 0,
    totalProfit: 0,
    wins: 0,
    losses: 0,
    rejects: 0,
    pending: 0,
  };
  if (!pool)
    return empty;
  try {
    const { params, where } = polymarketOrdersRangeWhere(startMs, endMs, userIds);
    // 卖单非下注：totalBet / totalProfit 只计买单（盈亏已累加在买单 money）
    const { rows } = await pool.query(
      `SELECT
        COUNT(*)::int AS order_count,
        COALESCE(SUM(o.bet_money) FILTER (
          WHERE LOWER(COALESCE(o.raw->>'pmSide', '')) IS DISTINCT FROM 'sell'
        ), 0)::float AS total_bet,
        COALESCE(SUM(o.money) FILTER (
          WHERE LOWER(COALESCE(o.raw->>'pmSide', '')) IS DISTINCT FROM 'sell'
        ), 0)::float AS total_profit,
        COUNT(*) FILTER (WHERE o.status = 'Win')::int AS wins,
        COUNT(*) FILTER (WHERE o.status = 'Lose')::int AS losses,
        COUNT(*) FILTER (WHERE o.status = 'Reject')::int AS rejects,
        COUNT(*) FILTER (WHERE o.status IS DISTINCT FROM 'Win'
          AND o.status IS DISTINCT FROM 'Lose'
          AND o.status IS DISTINCT FROM 'Reject')::int AS pending
       FROM orders o
       WHERE ${where}`,
      params,
    );
    const row = rows?.[0];
    if (!row)
      return empty;
    return {
      orderCount: Number(row.order_count) || 0,
      totalBet: Number(row.total_bet) || 0,
      totalProfit: Number(row.total_profit) || 0,
      wins: Number(row.wins) || 0,
      losses: Number(row.losses) || 0,
      rejects: Number(row.rejects) || 0,
      pending: Number(row.pending) || 0,
    };
  }
  catch (err) {
    console.warn("[rds] fetchPolymarketOrderStatsInRange:", err.message);
    return empty;
  }
}

/** Polymarket Builder 看板：时间范围内 changmen Polymarket 订单列表 */
export async function fetchPolymarketOrdersInRange(startMs, endMs, userIds, limit = 500) {
  const pool = getPgPool();
  if (!pool)
    return [];
  try {
    const { params, where } = polymarketOrdersRangeWhere(startMs, endMs, userIds);
    params.push(Math.min(Math.max(Number(limit) || 500, 1), 500));
    const { rows } = await pool.query(
      `SELECT o.order_id, o.user_id, o.player_id, o.provider, o.match, o.bet, o.item,
              o.status, o.bet_money, o.money, o.odds, o.create_at, o.raw,
              COALESCE(o.raw->>'game', '') AS game,
              COALESCE(o.raw->>'pmSide', '') AS pm_side,
              NULLIF(o.raw->>'pmFillPrice', '')::float AS fill_price,
              p.user_name
       FROM orders o
       LEFT JOIN profiles p ON p.id = o.user_id
       WHERE ${where}
       ORDER BY o.create_at DESC
       LIMIT $${params.length}`,
      params,
    );
    return rows || [];
  }
  catch (err) {
    console.warn("[rds] fetchPolymarketOrdersInRange:", err.message);
    return [];
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
