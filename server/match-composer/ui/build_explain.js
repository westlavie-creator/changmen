import { findPlatformMatch } from "../src/sides/orientation_lock.js";

/**
 * 把 composeOnce 产出压成前端可展示的「依据 + 过程」视图。
 * 不写库；不回传完整赔率。
 */

const BASIS_LABEL = {
  seed: "继承 RDS 种子（已有 client_match）",
  id: "gb 队对 + 时间窗（±60min）",
  name: "队名 + 时间窗（±30min）",
  reconciled: "ID/队名后补合并（贴馆或并场）",
  binding: "人工 platform_bindings",
  rds: "RDS client_matches（已落库）",
};

const LOCK_LABEL = {
  polymarket: "锚点 Polymarket",
  pm: "锚点 Polymarket",
  ob: "锚点 OB",
  ray: "锚点 RAY",
  existing: "粘性：沿用 RDS 已有朝向",
  sticky: "粘性：沿用 RDS 已有朝向",
};

function lockLabel(src) {
  const s = String(src || "").toLowerCase();
  if (!s)
    return "未锁定（无 Sources）";
  for (const [k, v] of Object.entries(LOCK_LABEL)) {
    if (s === k || s.startsWith(`${k}:`) || s.startsWith(`${k}_`))
      return `${v}（${src}）`;
  }
  if (s.startsWith("reanchor"))
    return `重锚定（${src}）`;
  if (s.startsWith("upgrade"))
    return `锚点升级（${src}）`;
  return String(src);
}

function basisLabel(basis) {
  return BASIS_LABEL[basis] || (basis ? String(basis) : "未知");
}

/**
 * 展示用合场依据：seed/binding/reconciled/rds 保留；
 * id/name 以 MergeKey 前缀为准（避免字段丢失或过期导致徽章误导）。
 */
export function resolveDisplayBasis(row) {
  const tagged = row?._clusterBasis || null;
  if (tagged === "seed" || tagged === "binding" || tagged === "reconciled" || tagged === "rds")
    return tagged;
  const mk = String(row?.MergeKey || "");
  if (mk.startsWith("match:id:"))
    return "id";
  if (mk.startsWith("match:name:"))
    return "name";
  return tagged;
}

function map0Sources(row) {
  const bet0 = (row.Bets || []).find(b => (Number(b.Map) || 0) === 0)
    || (row.Bets || [])[0];
  const sources = bet0?.Sources || {};
  const out = {};
  for (const [platform, src] of Object.entries(sources)) {
    if (!src || typeof src !== "object")
      continue;
    out[platform] = {
      home: src.HomeName || src.homeName || src.Home || src.home || "",
      away: src.AwayName || src.awayName || src.Away || src.away || "",
      homeId: src.HomeID || src.homeId || "",
      awayId: src.AwayID || src.awayId || "",
      oddHome: src.HomeOdds ?? src.Odd1 ?? src.HomeOdd ?? null,
      oddAway: src.AwayOdds ?? src.Odd2 ?? src.AwayOdd ?? null,
    };
  }
  return out;
}

/** 各馆主客：原生 platform_matches + 投影后（若有） */
function buildVenues(row, matches) {
  const reverse = new Set(row.Reverse || []);
  const projected = map0Sources(row);
  const venues = [];
  for (const [platform, sid] of Object.entries(row.Matchs || {})) {
    const pm = matches ? findPlatformMatch(matches, platform, sid) : null;
    const src = projected[platform];
    const nativeHome = pm ? String(pm.Home ?? pm.home ?? "").trim() : "";
    const nativeAway = pm ? String(pm.Away ?? pm.away ?? "").trim() : "";
    const reversed = reverse.has(platform);
    // 投影朝向下的展示名：有 Sources 队名用 Sources；否则按 Reverse 交换原生名
    let displayHome = src?.home || "";
    let displayAway = src?.away || "";
    if (!displayHome && !displayAway && (nativeHome || nativeAway)) {
      displayHome = reversed ? nativeAway : nativeHome;
      displayAway = reversed ? nativeHome : nativeAway;
    }
    venues.push({
      platform,
      sourceMatchId: String(sid),
      nativeHome,
      nativeAway,
      nativeHomeId: pm ? String(pm.HomeID ?? pm.home_id ?? "").trim() : "",
      nativeAwayId: pm ? String(pm.AwayID ?? pm.away_id ?? "").trim() : "",
      displayHome,
      displayAway,
      projectedHomeId: src?.homeId || "",
      projectedAwayId: src?.awayId || "",
      reversed,
      omitted: !(src || nativeHome || nativeAway),
    });
  }
  return venues;
}

function omitSummary(events) {
  const by = new Map();
  for (const e of events || []) {
    const key = `${e.platform}|${e.reason || "?"}`;
    by.set(key, (by.get(key) || 0) + 1);
  }
  return [...by.entries()].map(([key, n]) => {
    const [platform, reason] = key.split("|");
    return { platform, reason, maps: n };
  });
}

function buildProcess(row) {
  const platforms = Object.keys(row.Matchs || {});
  const lockSrc = row._lockSource || row._lockAnchor;
  const reverse = row.Reverse || [];
  const omitted = omitSummary(row._omitEvents);
  const steps = [
    {
      step: 1,
      name: "聚类合场",
      status: "ok",
      detail: basisLabel(resolveDisplayBasis(row)),
      meta: {
        basis: resolveDisplayBasis(row),
        mergeKey: row.MergeKey || null,
        platforms,
        reconciled: !!row._reconciled,
      },
    },
    {
      step: 2,
      name: "分配 client ID",
      status: Number(row.ID) > 0 ? "ok" : "warn",
      detail: Number(row.ID) > 0
        ? `ID=${row.ID}${row._reusedId ? "（复用 RDS）" : "（本拍新建/临时）"}`
        : "无正 ID",
      meta: { id: row.ID ?? null },
    },
    {
      step: 3,
      name: "主客朝向锁定",
      status: lockSrc ? "ok" : "warn",
      detail: lockLabel(lockSrc),
      meta: { lockSource: lockSrc || null },
    },
    {
      step: 4,
      name: "投影各馆 Sources",
      status: omitted.length ? "warn" : "ok",
      detail: reverse.length
        ? `Reverse=[${reverse.join(", ")}]；对齐 ${platforms.length - reverse.length} 馆`
        : `全部按锁朝向对齐（${platforms.length} 馆）`,
      meta: {
        reverse,
        ambiguous: row.SideAlignAmbiguous || [],
        omitted,
      },
    },
    {
      step: 5,
      name: "存活过滤",
      status: "ok",
      detail: `≥${2} 馆 + 未结束 → 进入展示列表`,
      meta: { platformCount: platforms.length },
    },
  ];
  return steps;
}

export function buildComposerExplain(result, {
  existingClientRows = [],
  previousActiveIds = null,
  matches = null,
} = {}) {
  const existingIds = previousActiveIds instanceof Set
    ? previousActiveIds
    : new Set(
      (previousActiveIds || existingClientRows || [])
        .map(r => (typeof r === "number" ? r : Number(r?.id ?? r?.ID)))
        .filter(id => Number.isFinite(id) && id > 0),
    );

  const platformMatches = matches || result.matches || null;

  const matchesOut = (result.info || []).map((row) => {
    const id = Number(row.ID);
    const reused = Number.isFinite(id) && id > 0 && existingIds.has(id);
    const enriched = { ...row, _reusedId: reused };
    const venues = buildVenues(row, platformMatches);
    const clusterBasis = resolveDisplayBasis(row);
    return {
      id: Number.isFinite(id) ? id : null,
      title: row.Title || "",
      game: row.Game || "",
      gameId: row.GameID || "",
      bo: row.BO ?? null,
      startTime: row.StartTime || 0,
      mergeKey: row.MergeKey || "",
      clusterBasis,
      clusterBasisLabel: basisLabel(clusterBasis),
      platforms: Object.keys(row.Matchs || {}),
      matchs: { ...(row.Matchs || {}) },
      venues,
      lockSource: row._lockSource || row._lockAnchor || null,
      lockLabel: lockLabel(row._lockSource || row._lockAnchor),
      reverse: [...(row.Reverse || [])],
      ambiguous: [...(row.SideAlignAmbiguous || [])],
      omitted: omitSummary(row._omitEvents),
      sources: map0Sources(row),
      reusedId: reused,
      isNew: !reused,
      process: buildProcess(enriched),
    };
  });

  matchesOut.sort((a, b) => (b.startTime || 0) - (a.startTime || 0));

  const basisCount = {};
  for (const m of matchesOut) {
    const k = m.clusterBasis || "unknown";
    basisCount[k] = (basisCount[k] || 0) + 1;
  }

  return {
    builtAt: result.builtAt || Date.now(),
    wrote: !!result.wrote,
    fromVenuesOnly: !!result.fromVenuesOnly,
    matchCount: matchesOut.length,
    endedCount: result.endedCount || 0,
    mergedDuplicateIds: result.mergedDuplicateIds || 0,
    skippedBindings: result.skippedBindings || 0,
    alignStats: result.alignStats || null,
    projectStats: result.projectStats || null,
    basisCount,
    pipeline: result.fromVenuesOnly
      ? [
        "snapshot（仅 platform_matches / bets / timers；忽略 client_matches）",
        "剥离 ClientMatchId / 绑定 / overrides",
        "clusterByGbThenName（仅 gb id → 队名，无 seed）",
        "reconcileByName（贴漏网馆 + 并 id/name 裂场）",
        "resolveIdsDryRun（不复用 RDS ID）",
        "orientationLock（PM→OB→RAY，无 sticky）+ projectSources",
        "liveShape + multi-platform + ended 过滤",
      ]
      : [
        "snapshot（RDS platform_matches / bets / timers / client_matches）",
        "alignUnmatched → 未匹配行挂到已有 client",
        "clusterByGbThenName（seed → gb id → 队名）",
        "reconcileByName（贴漏网馆 + 并 id/name 裂场）",
        "platform_bindings（队对校验）",
        "resolveIdsDryRun + 同 ID 去重",
        "orientationLock（PM→OB→RAY）+ projectSources",
        "liveShape + multi-platform + ended 过滤",
      ],
    matches: matchesOut,
  };
}

/** RDS client_matches 行 → 与模拟侧同形的卡片（只读展示） */
export function buildRdsClientExplain(clientRows = [], { matches = null } = {}) {
  const info = (clientRows || []).map((cm) => {
    const matchs = cm.matchs || cm.Matchs || {};
    const reverse = cm.reverse || cm.Reverse || [];
    return {
      ID: Number(cm.id ?? cm.ID) || undefined,
      Title: cm.title || cm.Title || "",
      Game: cm.game || cm.Game || "",
      GameID: cm.game_id ?? cm.GameID ?? "",
      BO: cm.bo ?? cm.BO ?? null,
      StartTime: Number(cm.start_time ?? cm.StartTime) || 0,
      MergeKey: cm.merge_key || cm.MergeKey || "",
      Matchs: { ...matchs },
      Reverse: Array.isArray(reverse) ? [...reverse] : [],
      Bets: cm.bets || cm.Bets || [],
      _clusterBasis: "rds",
      _lockSource: (cm.home_gb_team_id || cm.away_gb_team_id) ? "existing" : null,
      _lockAnchor: (cm.home_gb_team_id || cm.away_gb_team_id) ? "existing" : null,
      _omitEvents: [],
      SideAlignAmbiguous: [],
      _homeGb: cm.home_gb_team_id || null,
      _awayGb: cm.away_gb_team_id || null,
    };
  });

  const explain = buildComposerExplain(
    {
      info,
      builtAt: Date.now(),
      wrote: false,
      fromVenuesOnly: false,
      endedCount: 0,
      projectStats: null,
      alignStats: null,
      matches,
    },
    {
      previousActiveIds: info.map(r => Number(r.ID)).filter(id => id > 0),
      matches,
    },
  );

  // 覆盖过程文案：左栏是落库真相，不是本拍 pipeline
  for (const m of explain.matches) {
    m.clusterBasis = "rds";
    m.clusterBasisLabel = basisLabel("rds");
    m.isNew = false;
    m.reusedId = true;
    m.process = [
      {
        step: 1,
        name: "RDS 已落库",
        status: "ok",
        detail: "直接读取 client_matches，非本拍模拟合场",
        meta: {
          id: m.id,
          homeGb: info.find(r => Number(r.ID) === m.id)?._homeGb || null,
          awayGb: info.find(r => Number(r.ID) === m.id)?._awayGb || null,
        },
      },
      {
        step: 2,
        name: "馆绑定 Matchs",
        status: "ok",
        detail: `${m.platforms.length} 馆：${m.platforms.join(", ") || "无"}`,
        meta: { matchs: m.matchs },
      },
      {
        step: 3,
        name: "朝向 / Reverse",
        status: "ok",
        detail: (m.reverse || []).length
          ? `Reverse=[${m.reverse.join(", ")}]`
          : "无 Reverse 记录",
        meta: { reverse: m.reverse },
      },
    ];
  }

  explain.pipeline = [
    "SELECT * FROM client_matches（RDS 已合并结果）",
    "仅展示，不参与右侧模拟",
  ];
  explain.label = "RDS client_matches";
  explain.side = "left";
  return explain;
}

/** 馆 sid 签名，便于左右对照配对 */
export function matchsSignature(matchs) {
  return Object.entries(matchs || {})
    .map(([p, sid]) => `${p}:${sid}`)
    .sort()
    .join("|");
}
