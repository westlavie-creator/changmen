/**
 * value_signals 表读写。
 * 独立使用 pg_pool，不侵入 @changmen/db 的现有 store。
 */

import { getPgPool } from "@changmen/db";

/**
 * 插入或更新一条 value signal（open 状态下按 dedup key upsert）。
 * @param {Object} sig
 */
export async function upsertSignal(sig) {
  const pool = getPgPool();
  if (!pool) return null;

  const { rows } = await pool.query(
    `INSERT INTO value_signals (
       match_id, match_title, game, start_time,
       bet_name, map, home_name, away_name,
       sharp_platform, sharp_home_odds, sharp_away_odds, overround,
       fair_odds, soft_platform, soft_side, soft_odds,
       edge, kelly_full, kelly_frac, true_prob
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20
     )
     ON CONFLICT (match_id, bet_name, map, soft_platform, soft_side)
       WHERE status = 'open'
     DO UPDATE SET
       sharp_home_odds = EXCLUDED.sharp_home_odds,
       sharp_away_odds = EXCLUDED.sharp_away_odds,
       overround       = EXCLUDED.overround,
       fair_odds        = EXCLUDED.fair_odds,
       soft_odds        = EXCLUDED.soft_odds,
       edge             = EXCLUDED.edge,
       kelly_full       = EXCLUDED.kelly_full,
       kelly_frac       = EXCLUDED.kelly_frac,
       true_prob        = EXCLUDED.true_prob
     RETURNING id`,
    [
      sig.matchId, sig.matchTitle, sig.game, sig.startTime,
      sig.betName, sig.map, sig.homeName, sig.awayName,
      sig.sharpPlatform, sig.sharpHome, sig.sharpAway, sig.overround,
      sig.fairOdds, sig.softPlatform, sig.softSide, sig.softOdds,
      sig.edge, sig.kellyFull, sig.kellyFrac, sig.trueProb,
    ],
  );
  return rows[0]?.id ?? null;
}

/**
 * 批量 upsert signals。
 */
export async function upsertSignals(signals) {
  if (!signals.length) return;
  const pool = getPgPool();
  if (!pool) return;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const sig of signals) {
      await client.query(
        `INSERT INTO value_signals (
           match_id, match_title, game, start_time,
           bet_name, map, home_name, away_name,
           sharp_platform, sharp_home_odds, sharp_away_odds, overround,
           fair_odds, soft_platform, soft_side, soft_odds,
           edge, kelly_full, kelly_frac, true_prob
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20
         )
         ON CONFLICT (match_id, bet_name, map, soft_platform, soft_side)
           WHERE status = 'open'
         DO UPDATE SET
           sharp_home_odds = EXCLUDED.sharp_home_odds,
           sharp_away_odds = EXCLUDED.sharp_away_odds,
           overround       = EXCLUDED.overround,
           fair_odds        = EXCLUDED.fair_odds,
           soft_odds        = EXCLUDED.soft_odds,
           edge             = EXCLUDED.edge,
           kelly_full       = EXCLUDED.kelly_full,
           kelly_frac       = EXCLUDED.kelly_frac,
           true_prob        = EXCLUDED.true_prob`,
        [
          sig.matchId, sig.matchTitle, sig.game, sig.startTime,
          sig.betName, sig.map, sig.homeName, sig.awayName,
          sig.sharpPlatform, sig.sharpHome, sig.sharpAway, sig.overround,
          sig.fairOdds, sig.softPlatform, sig.softSide, sig.softOdds,
          sig.edge, sig.kellyFull, sig.kellyFrac, sig.trueProb,
        ],
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * 将超过指定时间未刷新的 open 信号标记为 expired。
 */
export async function expireStaleSignals(maxAgeMs) {
  const pool = getPgPool();
  if (!pool) return 0;

  const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
  const { rowCount } = await pool.query(
    `UPDATE value_signals
     SET status = 'expired', expired_at = now()
     WHERE status = 'open' AND created_at < $1`,
    [cutoff],
  );
  return rowCount;
}

/**
 * 获取当前所有 open 状态的信号（按 edge 降序）。
 */
export async function fetchOpenSignals(limit = 50) {
  const pool = getPgPool();
  if (!pool) return [];

  const { rows } = await pool.query(
    `SELECT * FROM value_signals
     WHERE status = 'open'
     ORDER BY edge DESC
     LIMIT $1`,
    [limit],
  );
  return rows;
}

/**
 * 获取历史信号统计。
 */
export async function fetchSignalStats() {
  const pool = getPgPool();
  if (!pool) return null;

  const { rows } = await pool.query(
    `SELECT
       status,
       COUNT(*)::int AS count,
       ROUND(AVG(edge)::numeric, 5) AS avg_edge,
       ROUND(MAX(edge)::numeric, 5) AS max_edge
     FROM value_signals
     GROUP BY status
     ORDER BY status`,
  );
  return rows;
}
