/**
 * match-composer 对照页：左 RDS client_matches · 右纯场馆模拟合场。
 * 只读，不写库。无服务端缓存：每次 /api/compare 都现拉 RDS。
 * 端口 COMPOSER_UI_PORT（默认 4568）。
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchClientMatches, initDatabaseUrl, isMatcherStoreReady } from "@changmen/db";
import express from "express";
import "../lib/env.js";
import { composeOnce } from "../ops/compose_once.js";
import {
  buildComposerExplain,
  buildRdsClientExplain,
} from "./build_explain.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.COMPOSER_UI_PORT || 4568);

await initDatabaseUrl();

const app = express();
app.use(express.json({ limit: "2mb" }));

/** 仅合并同一时刻的并发请求，不做时间窗缓存 */
let inflight = null;

function attachPairHints(leftMatches, rightMatches) {
  const usedRight = new Set();

  function overlap(a, b) {
    const setA = new Set(
      Object.entries(a || {}).map(([p, sid]) => `${p}:${sid}`),
    );
    let n = 0;
    for (const [p, sid] of Object.entries(b || {})) {
      if (setA.has(`${p}:${sid}`))
        n += 1;
    }
    return n;
  }

  // 贪心：按重叠馆数配对（≥2 才算同一场）
  const pairs = [];
  for (let i = 0; i < leftMatches.length; i++) {
    let bestJ = -1;
    let bestScore = 1;
    for (let j = 0; j < rightMatches.length; j++) {
      if (usedRight.has(j))
        continue;
      const score = overlap(leftMatches[i].matchs, rightMatches[j].matchs);
      if (score > bestScore) {
        bestScore = score;
        bestJ = j;
      }
    }
    if (bestJ >= 0) {
      usedRight.add(bestJ);
      pairs.push([i, bestJ, bestScore]);
    }
  }

  for (const m of leftMatches) {
    m.pairStatus = "left-only";
    m.pairId = null;
    m.pairOverlap = 0;
  }
  for (const m of rightMatches) {
    m.pairStatus = "right-only";
    m.pairId = null;
    m.pairOverlap = 0;
  }
  for (const [i, j, score] of pairs) {
    leftMatches[i].pairStatus = "both";
    leftMatches[i].pairId = rightMatches[j].id;
    leftMatches[i].pairOverlap = score;
    rightMatches[j].pairStatus = "both";
    rightMatches[j].pairId = leftMatches[i].id;
    rightMatches[j].pairOverlap = score;
  }
}

async function runCompare() {
  if (inflight)
    return inflight;

  const job = (async () => {
    try {
      if (!isMatcherStoreReady()) {
        throw new Error("数据库未配置（DATABASE_URL / DATABASE_URL_PUBLIC）");
      }

      const [clientRows, simResult] = await Promise.all([
        fetchClientMatches(),
        composeOnce({ write: false, registerTeams: true, fromVenuesOnly: true }),
      ]);

      const left = buildRdsClientExplain(clientRows || [], {
        matches: simResult.matches || null,
      });
      const right = buildComposerExplain(simResult, {
        previousActiveIds: [],
        matches: simResult.matches || null,
      });
      right.label = "模拟合场（纯场馆）";
      right.side = "right";

      attachPairHints(left.matches, right.matches);

      return {
        builtAt: simResult.builtAt || Date.now(),
        left,
        right,
        pairSummary: {
          both: left.matches.filter(m => m.pairStatus === "both").length,
          leftOnly: left.matches.filter(m => m.pairStatus === "left-only").length,
          rightOnly: right.matches.filter(m => m.pairStatus === "right-only").length,
        },
        cached: false,
        cacheAgeMs: 0,
      };
    }
    finally {
      if (inflight === job)
        inflight = null;
    }
  })();

  inflight = job;
  return job;
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    db: isMatcherStoreReady(),
    port: PORT,
    write: false,
    cache: false,
    note: "左栏 RDS client_matches · 右栏纯场馆模拟合场 · 无缓存每次现拉",
  });
});

app.get("/api/compare", async (_req, res) => {
  try {
    const data = await runCompare();
    const leftMatches = data.left.matches || [];
    const rightMatches = data.right.matches || [];

    res.json({
      ok: true,
      builtAt: data.builtAt,
      cached: false,
      cacheAgeMs: 0,
      pairSummary: data.pairSummary,
      left: {
        ...data.left,
        matchCount: leftMatches.length,
        totalMatchCount: leftMatches.length,
        matches: leftMatches,
      },
      right: {
        ...data.right,
        matchCount: rightMatches.length,
        totalMatchCount: rightMatches.length,
        matches: rightMatches,
      },
      filters: { q: null, basis: null },
    });
  }
  catch (err) {
    console.error("[composer-ui]", err);
    res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});

app.use(express.static(path.join(__dirname, "public")));

app.use((err, _req, res, _next) => {
  console.error("[composer-ui] request error:", err.message);
  if (!res.headersSent)
    res.status(500).json({ ok: false, error: err.message });
});

app.listen(PORT, () => {
  console.log(`[composer-ui] http://localhost:${PORT}`);
  console.log(`[composer-ui] 左=RDS client_matches · 右=纯场馆模拟 · 无缓存`);
  console.log(`[composer-ui] API: GET /api/compare`);
  if (!isMatcherStoreReady())
    console.warn("[composer-ui] 数据库未配置，/api/compare 将失败");
}).on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `[composer-ui] 端口 ${PORT} 已被占用。`
      + ` 可先关闭旧进程，或设 COMPOSER_UI_PORT=4569 再启动。`
      + (process.platform === "win32"
        ? `\n  Windows: netstat -ano | findstr :${PORT}`
        : `\n  Unix: lsof -i :${PORT}`),
    );
    process.exit(1);
  }
  throw err;
});
