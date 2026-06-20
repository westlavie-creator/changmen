import { getPgPool } from "@changmen/db";

export async function getValueBetDashboard() {
  const pool = getPgPool();
  if (!pool) return { available: false, signals: [], stats: [], platformDist: [], queriedAt: Date.now() };

  try {
    const [signalsRes, statsRes, distRes] = await Promise.all([
      pool.query(
        `SELECT * FROM value_signals WHERE status = 'open' ORDER BY edge DESC LIMIT 100`,
      ),
      pool.query(
        `SELECT status, COUNT(*)::int AS count,
           ROUND(AVG(edge)::numeric, 5) AS avg_edge,
           ROUND(MAX(edge)::numeric, 5) AS max_edge
         FROM value_signals GROUP BY status ORDER BY status`,
      ),
      pool.query(
        `SELECT soft_platform, COUNT(*)::int AS count,
           ROUND(AVG(edge)::numeric, 5) AS avg_edge
         FROM value_signals WHERE status = 'open'
         GROUP BY soft_platform ORDER BY count DESC`,
      ),
    ]);

    return {
      available: true,
      signals: signalsRes.rows,
      stats: statsRes.rows,
      platformDist: distRes.rows,
      queriedAt: Date.now(),
    };
  } catch (err) {
    if (err.code === "42P01") {
      return { available: false, signals: [], stats: [], platformDist: [], queriedAt: Date.now() };
    }
    throw err;
  }
}
