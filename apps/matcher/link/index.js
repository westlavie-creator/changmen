import "../lib/env.js";
import {
  normalizeTeam,
  manualMergeKey,
  ensureClientMatchId,
  isPlaceholderTeamName,
  formatTitle,
  providerPriority,
  teamsFromPlatformRows,
} from "@changmen/match-engine";
import { resolveClientGame, getGameCodeForPlatformId } from "@changmen/shared/catalog/game_catalog.mjs";
import { rebuildOnce } from "../ops/rebuild.js";
import * as db from "@changmen/db";

/**
 * 人工关联：平台赛事 → client_match，并写入队伍 ID 映射。
 */

function gameCodeForPlatform(platform, sourceGameId) {
  return getGameCodeForPlatformId(platform, sourceGameId);
}

function parseGbTeamId(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseTitleTeams(title) {
  const t = String(title || "").trim();
  if (!t.includes(" vs ")) return null;
  const parts = t.split(" vs ").map((s) => s.trim());
  if (parts.length < 2) return null;
  const [home, away] = parts;
  if (isPlaceholderTeamName(home) || isPlaceholderTeamName(away)) return null;
  return { home, away };
}

function resolveClientTeams(cm, pm, platformsById) {
  const fromTitle = parseTitleTeams(cm.title);
  if (fromTitle) return fromTitle;

  const bets = Array.isArray(cm.bets) ? cm.bets : [];
  if (bets.length) {
    const b = bets[0];
    const home = String(b.HomeName || b.homeName || "").trim();
    const away = String(b.AwayName || b.awayName || "").trim();
    if (!isPlaceholderTeamName(home) && !isPlaceholderTeamName(away)) {
      return { home, away };
    }
  }

  for (const [plat, srcId] of Object.entries(cm.matchs || {}).sort(
    ([a], [b]) => providerPriority(b) - providerPriority(a),
  )) {
    const row = platformsById?.[`${plat}:${srcId}`];
    if (row && !isPlaceholderTeamName(row.home) && !isPlaceholderTeamName(row.away)) {
      return { home: String(row.home).trim(), away: String(row.away).trim() };
    }
  }

  if (pm && !isPlaceholderTeamName(pm.home) && !isPlaceholderTeamName(pm.away)) {
    return { home: String(pm.home).trim(), away: String(pm.away).trim() };
  }

  return null;
}

/** @returns {{ mode: 'aligned'|'reversed'|'ambiguous', reversed: boolean|null, detail?: string }} */
function analyzeSideAlignment(pmHome, pmAway, cmHome, cmAway) {
  const ph = normalizeTeam(pmHome);
  const pa = normalizeTeam(pmAway);
  const ch = normalizeTeam(cmHome);
  const ca = normalizeTeam(cmAway);
  if (!ph || !pa || !ch || !ca) {
    return { mode: "ambiguous", reversed: null, detail: "队名不完整，无法自动判断" };
  }

  const directHome = ph === ch;
  const directAway = pa === ca;
  const swapHome = ph === ca;
  const swapAway = pa === ch;

  if (directHome && directAway) {
    return { mode: "aligned", reversed: false, detail: "主客与系统一致" };
  }
  if (swapHome && swapAway) {
    return { mode: "reversed", reversed: true, detail: "平台主客与系统相反" };
  }

  const parts = [];
  if (directHome) parts.push("主队名一致");
  else if (swapHome) parts.push("平台主与系统客名一致");
  if (directAway) parts.push("客队名一致");
  else if (swapAway) parts.push("平台客与系统主名一致");
  const detail = parts.length ? `${parts.join("，")}，但整体无法判定` : "队名无法对应";
  return { mode: "ambiguous", reversed: null, detail };
}

async function allocateManualGbTeamId() {
  const id = await db.nextManualGbTeamId();
  return parseGbTeamId(id);
}

async function ensureManualGbTeamIdOnRow(row) {
  if (!row) return null;
  if (row.gb_team_id != null) return parseGbTeamId(row.gb_team_id);
  const manualGbTeamId = await allocateManualGbTeamId();
  const updated = await db.updateCanonicalTeamById(row.id, {
    gb_team_id: manualGbTeamId,
    updated_by: "手动",
  });
  if (!updated) {
    throw new Error(
      `标准队伍「${row.name}」（${row.game}）分配 gb_team_id 失败`,
    );
  }
  return parseGbTeamId(updated.gb_team_id);
}

function isPgUniqueViolation(error) {
  return error?.code === "23505";
}

function uniqueConstraintKind(error) {
  const msg = String(error?.message || error?.details || "");
  if (msg.includes("canonical_teams_game_name_key")) return "game_name";
  if (msg.includes("canonical_teams_gb_team_id_key")) return "gb_team_id";
  return "unknown";
}

async function describeCanonicalTeamRow(row) {
  if (!row) return null;
  const game = row.game || "?";
  const label = row.name || "?";
  if (row.gb_team_id != null) {
    return `游戏 ${game} · 标准队伍「${label}」· 已有 gb_team_id ${row.gb_team_id}`;
  }
  return `游戏 ${game} · 标准队伍「${label}」· 尚无 gb_team_id（种子/历史数据）`;
}

async function recoverCanonicalTeamAfterUniqueViolation(gameCode, name, norm) {
  const exact = await fetchCanonicalTeamExact(gameCode, name);
  if (exact) return exact;
  const byNorm = await findCanonicalTeamByNormalizedName(gameCode, norm);
  if (byNorm) return byNorm;
  return null;
}

async function buildCanonicalInsertConflictMessage(gameCode, name, error) {
  const kind = uniqueConstraintKind(error);
  const row = await recoverCanonicalTeamAfterUniqueViolation(
    gameCode,
    name,
    normalizeTeam(name),
  );
  const existing = row ? await describeCanonicalTeamRow(row) : null;

  if (kind === "gb_team_id") {
    return [
      "分配 gb_team_id 时发生冲突（编号已被占用）",
      "请刷新页面后重新拖线关联",
    ].join("\n");
  }

  if (existing) {
    return [
      "无法新建标准队伍：与库中已有记录重名",
      existing,
      "请刷新页面后重试；若仍失败，可能是数据同步延迟",
    ].join("\n");
  }

  return [
    `无法新建标准队伍：游戏 ${gameCode} · 队名「${name}」与库中记录冲突`,
    "请刷新页面后重新拖线；若反复出现，请检查 canonical_teams 是否已有同名队伍",
  ].join("\n");
}

async function fetchCanonicalTeamExact(gameCode, name) {
  return db.fetchCanonicalTeamExact(gameCode, name);
}

async function findCanonicalTeamByNormalizedName(gameCode, norm) {
  return db.findCanonicalTeamByNormalizedName(gameCode, norm);
}

/** 仅 Matcher 手动拖线连线：gb_team_id 从 100000 自增，updated_by = 手动 */
async function resolveOrCreateManualTeam(gameCode, teamName) {
  const name = String(teamName || "").trim();
  if (!name || isPlaceholderTeamName(name)) {
    throw new Error("队名无效");
  }

  const norm = normalizeTeam(name);

  const exact = await fetchCanonicalTeamExact(gameCode, name);
  if (exact) return ensureManualGbTeamIdOnRow(exact);

  const byNorm = await findCanonicalTeamByNormalizedName(gameCode, norm);
  if (byNorm) return ensureManualGbTeamIdOnRow(byNorm);

  const manualGbTeamId = await allocateManualGbTeamId();
  try {
    const inserted = await db.insertCanonicalTeam({
      gb_team_id: manualGbTeamId,
      game: gameCode,
      name,
      updated_by: "手动",
    });
    return parseGbTeamId(inserted.gb_team_id);
  } catch (error) {
    if (isPgUniqueViolation(error)) {
      const existing = await recoverCanonicalTeamAfterUniqueViolation(gameCode, name, norm);
      if (existing) {
        try {
          return await ensureManualGbTeamIdOnRow(existing);
        } catch (reuseErr) {
          const detail = await describeCanonicalTeamRow(existing);
          throw new Error(
            [`复用已有标准队伍失败`, detail, reuseErr.message].filter(Boolean).join("\n")
          );
        }
      }
      throw new Error(await buildCanonicalInsertConflictMessage(gameCode, name, error));
    }
    throw new Error(
      `新建标准队伍失败（${gameCode} · 「${name}」）：${error.message}`
    );
  }
}

function resolveGameCodeForPlatformPair(pmA, pmB, cmHint) {
  for (const pm of [pmA, pmB]) {
    const code = gameCodeForPlatform(pm.platform, pm.source_game_id);
    if (code) return code;
  }
  if (cmHint) {
    const gid = String(cmHint.game_id || "").trim();
    const a8Map = { 1: "lol", 2: "dota2", 3: "cs2", 4: "kog", 8: "valorant" };
    const fromGid = a8Map[gid] || a8Map[Number(gid)];
    if (fromGid) return fromGid;
    const parsed = String(cmHint.game || "").match(/\(([^)]+)\)\s*$/);
    if (parsed) return parsed[1].toLowerCase();
  }
  return "unknown";
}

function resolvePairClientMatchKey(pmSource, pmTarget) {
  const idS = pmSource.match_id != null && pmSource.match_id !== "" ? Number(pmSource.match_id) : null;
  const idT = pmTarget.match_id != null && pmTarget.match_id !== "" ? Number(pmTarget.match_id) : null;
  if (idS && idT && idS !== idT) {
    throw new Error(`两场赛事已关联到不同 client_match（#${idS} 与 #${idT}），请使用合并功能`);
  }
  return {
    existingId: idT || idS || null,
    mergeKey: manualMergeKey(
      pmSource.platform,
      pmSource.source_match_id,
      pmTarget.platform,
      pmTarget.source_match_id
    ),
  };
}

async function resolvePairClientMatchId(pmSource, pmTarget, stub = {}) {
  const { existingId, mergeKey } = resolvePairClientMatchKey(pmSource, pmTarget);
  if (existingId) return existingId;
  const adapter = db.getClientMatchIdAdapter();
  return ensureClientMatchId(adapter, mergeKey, stub);
}

async function fetchPlatformMatchRow(platform, sourceMatchId) {
  const pm = await db.fetchPlatformMatchRow(platform, sourceMatchId);
  if (!pm) {
    const plat = String(platform || "").trim();
    const srcId = String(sourceMatchId || "").trim();
    throw new Error(`平台赛事不存在: ${plat} #${srcId}`);
  }
  return pm;
}

async function previewLinkPlatformAlignment({ platform, sourceMatchId, targetPlatform, targetMatchId }) {
  const srcPlat = String(platform || "").trim();
  const tgtPlat = String(targetPlatform || "").trim();
  const srcId = String(sourceMatchId || "").trim();
  const tgtId = String(targetMatchId || "").trim();
  if (!srcPlat || !tgtPlat || !srcId || !tgtId) throw new Error("参数不完整");
  if (srcPlat === tgtPlat) throw new Error("请拖到另一个平台的赛事");

  const [pmSource, pmTarget] = await Promise.all([
    fetchPlatformMatchRow(srcPlat, srcId),
    fetchPlatformMatchRow(tgtPlat, tgtId),
  ]);

  const refTeamsPick = teamsFromPlatformRows([
    { platform: pmSource.platform, home: pmSource.home, away: pmSource.away },
    { platform: pmTarget.platform, home: pmTarget.home, away: pmTarget.away },
  ]);
  if (!refTeamsPick) throw new Error("平台赛事队名不完整");
  const refTeams = { home: refTeamsPick.home, away: refTeamsPick.away };

  const alignment = analyzeSideAlignment(pmSource.home, pmSource.away, refTeams.home, refTeams.away);
  const { existingId, mergeKey } = resolvePairClientMatchKey(pmSource, pmTarget);

  return {
    linkType: "platform",
    platform: srcPlat,
    sourceMatchId: srcId,
    targetPlatform: tgtPlat,
    targetMatchId: tgtId,
    clientMatchId: existingId,
    mergeKey,
    clientMatchIdPending: !existingId,
    platformTeams: {
      home: pmSource.home,
      away: pmSource.away,
      home_id: pmSource.home_id,
      away_id: pmSource.away_id,
    },
    systemTeams: refTeams,
    targetTeams: {
      home: pmTarget.home,
      away: pmTarget.away,
      home_id: pmTarget.home_id,
      away_id: pmTarget.away_id,
    },
    alignment,
    suggestedReversed: alignment.reversed,
    sourceMatchIdExisting: pmSource.match_id,
    targetMatchIdExisting: pmTarget.match_id,
  };
}

async function linkPlatformToPlatform({
  platform,
  sourceMatchId,
  targetPlatform,
  targetMatchId,
  reversed: reversedInput,
}) {
  const preview = await previewLinkPlatformAlignment({
    platform,
    sourceMatchId,
    targetPlatform,
    targetMatchId,
  });

  const pmSource = await fetchPlatformMatchRow(preview.platform, preview.sourceMatchId);
  const pmTarget = await fetchPlatformMatchRow(preview.targetPlatform, preview.targetMatchId);
  const refTeamsPick = teamsFromPlatformRows([
    { platform: pmSource.platform, home: pmSource.home, away: pmSource.away },
    { platform: pmTarget.platform, home: pmTarget.home, away: pmTarget.away },
  ]);
  if (!refTeamsPick) throw new Error("平台赛事队名不完整");
  const refHome = refTeamsPick.home;
  const refAway = refTeamsPick.away;
  const cmId = await resolvePairClientMatchId(pmSource, pmTarget, {
    title: refTeamsPick.title,
    matchs: {
      [pmSource.platform]: String(pmSource.source_match_id),
      [pmTarget.platform]: String(pmTarget.source_match_id),
    },
  });

  let cmHint = null;
  if (pmTarget.match_id || pmSource.match_id) {
    const hintId = Number(pmTarget.match_id || pmSource.match_id);
    cmHint = await db.fetchClientMatchRow(hintId, "id,title,game,game_id");
  }

  const gameCode = resolveGameCodeForPlatformPair(pmSource, pmTarget, cmHint);

  const alignment = analyzeSideAlignment(pmSource.home, pmSource.away, refHome, refAway);
  let reversed;
  if (typeof reversedInput === "boolean") {
    reversed = reversedInput;
  } else if (alignment.mode === "aligned") {
    reversed = false;
  } else if (alignment.mode === "reversed") {
    reversed = true;
  } else {
    throw new Error("无法自动判断主客是否一致，请在确认框中选择「主客一致」或「主客颠倒」");
  }

  const srcHomeId = reversed ? pmSource.away_id : pmSource.home_id;
  const srcAwayId = reversed ? pmSource.home_id : pmSource.away_id;
  const srcHomeName = reversed ? pmSource.away : pmSource.home;
  const srcAwayName = reversed ? pmSource.home : pmSource.away;

  const mapResults = [];
  mapResults.push(await upsertTeamPlatformRecord(pmTarget.platform, pmTarget.home_id, pmTarget.home, gameCode));
  mapResults.push(await upsertTeamPlatformRecord(pmTarget.platform, pmTarget.away_id, pmTarget.away, gameCode));
  mapResults.push(await upsertTeamPlatformRecord(pmSource.platform, srcHomeId, srcHomeName, gameCode));
  mapResults.push(await upsertTeamPlatformRecord(pmSource.platform, srcAwayId, srcAwayName, gameCode));

  for (const pm of [pmSource, pmTarget]) {
    await db.setPlatformMatchId(pm.platform, pm.source_match_id, cmId, { force: true });
  }

  const rebuild = await rebuildOnce();

  return {
    ok: true,
    linkType: "platform",
    platform: preview.platform,
    source_match_id: preview.sourceMatchId,
    target_platform: preview.targetPlatform,
    target_match_id: preview.targetMatchId,
    client_match_id: cmId,
    reversed,
    sideAlignment: alignment.mode,
    gameCode,
    teams: { home: refHome, away: refAway },
    title: refTeamsPick.title,
    teamMapsWritten: mapResults.filter((r) => !r.skipped).length,
    rebuild,
    summary: `${preview.platform} #${preview.sourceMatchId} ↔ ${preview.targetPlatform} #${preview.targetMatchId} → 赛事 ${cmId}（${refHome} vs ${refAway}）`,
    logLines: [
      `平台赛事关联成功 · client_match #${cmId}`,
      `${preview.platform} #${preview.sourceMatchId} ↔ ${preview.targetPlatform} #${preview.targetMatchId}`,
      `赛事 ${refHome} vs ${refAway} · 主客${reversed ? "颠倒" : "一致"}（${alignment.mode}）`,
      `游戏 ${gameCode} · 写入 team_platform_maps ${mapResults.filter((r) => !r.skipped).length} 条（待识别，无 gb_team_id）`,
    ],
  };
}

async function upsertTeamPlatformRecord(platform, platformId, platformName, gameCode) {
  const pid = String(platformId || "").trim();
  if (!pid) return { skipped: true, reason: "no_platform_id" };

  await db.upsertTeamPlatformMaps([
    {
      platform: String(platform),
      platform_id: pid,
      platform_name: String(platformName || "").trim() || pid,
      game: gameCode,
      source: "manual",
      confidence: 1.0,
    },
  ]);
  return { skipped: false };
}

/** 手动匹配：写入 gb_team_id 映射 */
async function upsertManualTeamPlatformMap(gbTeamId, platform, platformId, platformName, gameCode) {
  const pid = String(platformId || "").trim();
  if (!pid) return { skipped: true, reason: "no_platform_id" };
  const id = parseGbTeamId(gbTeamId);
  if (id == null) throw new Error("gb_team_id 无效");

  await db.upsertTeamPlatformMaps([
    {
      canonical_id: id,
      platform: String(platform),
      platform_id: pid,
      platform_name: String(platformName || "").trim() || pid,
      game: gameCode,
      source: "manual",
      confidence: 1.0,
    },
  ]);
  return { skipped: false };
}

async function previewLinkAlignment({ platform, sourceMatchId, clientMatchId }) {
  const plat = String(platform || "").trim();
  const srcId = String(sourceMatchId || "").trim();
  const cmId = Number(clientMatchId);
  if (!plat || !srcId || !Number.isFinite(cmId)) {
    throw new Error("参数不完整");
  }

  const pm = await fetchPlatformMatchRow(plat, srcId);

  const cm = await db.fetchClientMatchRow(cmId, "id,title,game,game_id,matchs,bets");
  if (!cm) throw new Error("目标已匹配赛事不存在");

  const allPm = await db.fetchPlatformMatchesHomeAway();
  const platformsById = {};
  for (const row of allPm || []) {
    platformsById[`${row.platform}:${row.source_match_id}`] = row;
  }

  const teams = resolveClientTeams(cm, pm, platformsById);
  if (!teams) throw new Error("无法解析目标赛事的主客队");

  const alignment = analyzeSideAlignment(pm.home, pm.away, teams.home, teams.away);
  return {
    platform: plat,
    sourceMatchId: srcId,
    clientMatchId: cmId,
    platformTeams: {
      home: pm.home,
      away: pm.away,
      home_id: pm.home_id,
      away_id: pm.away_id,
    },
    systemTeams: teams,
    alignment,
    suggestedReversed: alignment.reversed,
  };
}

async function linkPlatformToClientMatch({ platform, sourceMatchId, clientMatchId, reversed: reversedInput }) {
  const plat = String(platform || "").trim();
  const srcId = String(sourceMatchId || "").trim();
  const cmId = Number(clientMatchId);
  if (!plat || !srcId || !Number.isFinite(cmId)) {
    throw new Error("参数不完整");
  }

  const pm = await fetchPlatformMatchRow(plat, srcId);

  const cm = await db.fetchClientMatchRow(cmId, "id,title,game,game_id,matchs,bets");
  if (!cm) throw new Error("目标已匹配赛事不存在");

  const allPm = await db.fetchPlatformMatchesHomeAway();
  const platformsById = {};
  for (const row of allPm || []) {
    platformsById[`${row.platform}:${row.source_match_id}`] = row;
  }

  const teams = resolveClientTeams(cm, pm, platformsById);
  if (!teams) throw new Error("无法解析目标赛事的主客队");

  let gameCode = gameCodeForPlatform(plat, pm.source_game_id);
  if (!gameCode) {
    const gid = String(cm.game_id || "").trim();
    const a8Map = { 1: "lol", 2: "dota2", 3: "cs2", 4: "kog", 8: "valorant" };
    gameCode = a8Map[gid] || a8Map[Number(gid)] || null;
  }
  if (!gameCode) {
    const parsed = String(cm.game || "").match(/\(([^)]+)\)\s*$/);
    gameCode = parsed ? parsed[1].toLowerCase() : "unknown";
  }

  const alignment = analyzeSideAlignment(pm.home, pm.away, teams.home, teams.away);
  let reversed;
  if (typeof reversedInput === "boolean") {
    reversed = reversedInput;
  } else if (alignment.mode === "aligned") {
    reversed = false;
  } else if (alignment.mode === "reversed") {
    reversed = true;
  } else {
    throw new Error("无法自动判断主客是否一致，请在确认框中选择「主客一致」或「主客颠倒」");
  }

  const pmHomeId = reversed ? pm.away_id : pm.home_id;
  const pmAwayId = reversed ? pm.home_id : pm.away_id;
  const pmHomeName = reversed ? pm.away : pm.home;
  const pmAwayName = reversed ? pm.home : pm.away;

  const mapResults = [];
  mapResults.push(await upsertTeamPlatformRecord(plat, pmHomeId, pmHomeName, gameCode));
  mapResults.push(await upsertTeamPlatformRecord(plat, pmAwayId, pmAwayName, gameCode));

  await db.setPlatformMatchId(plat, srcId, cmId, { force: true });

  const rebuild = await rebuildOnce();

  resolveClientGame(plat, pm.source_game_id);

  return {
    ok: true,
    platform: plat,
    source_match_id: srcId,
    client_match_id: cmId,
    reversed,
    sideAlignment: alignment.mode,
    gameCode,
    teams: { home: teams.home, away: teams.away },
    platformTeams: { home: pmHomeName, away: pmAwayName },
    platformTeamIds: { home: String(pmHomeId || ""), away: String(pmAwayId || "") },
    teamMapsWritten: mapResults.filter((r) => !r.skipped).length,
    rebuild,
    summary: `${plat} #${srcId} → 赛事 ${cmId}（${teams.home} vs ${teams.away}）`,
    logLines: [
      `赛事关联成功 · client_match #${cmId}`,
      `${plat} #${srcId} · ${pmHomeName} vs ${pmAwayName}`,
      `对齐 ${teams.home} vs ${teams.away} · 主客${reversed ? "颠倒" : "一致"}（${alignment.mode}）`,
      `游戏 ${gameCode} · 写入 team_platform_maps ${mapResults.filter((r) => !r.skipped).length} 条（待识别，无 gb_team_id）`,
    ],
  };
}

async function fetchTeamPlatformMap(platform, platformId) {
  return db.fetchTeamPlatformMap(platform, platformId);
}

function validateTeamLinkPair(a, b) {
  const platA = String(a?.platform || "").trim();
  const platB = String(b?.platform || "").trim();
  const idA = String(a?.platformId || "").trim();
  const idB = String(b?.platformId || "").trim();
  if (!platA || !platB || !idA || !idB) throw new Error("平台队伍 ID 不完整");
  if (platA === platB && idA === idB) throw new Error("不能关联同一支队伍");
  if (platA === platB) {
    throw new Error(
      `不能关联同一平台的两支队伍\n${platA} · ${String(a?.platformName || idA).trim()} (id ${idA})\n↔\n${platA} · ${String(b?.platformName || idB).trim()} (id ${idB})\n\n请拖到另一个平台的圆点`
    );
  }
  const gameCode = String(a?.gameCode || b?.gameCode || "").trim();
  if (!gameCode || gameCode === "unknown") throw new Error("无法解析游戏类型");
  return { platA, platB, idA, idB, gameCode };
}

async function countTeamMapsForGbId(gbTeamId) {
  return db.countTeamMapsForGbId(gbTeamId);
}

/** 将较大 gb_team_id 下的全部 platform 映射改写到较小编号 */
async function reassignGbTeamId(fromId, toId) {
  return db.reassignGbTeamId(fromId, toId);
}

function resolveTeamLinkGbPlan(gbA, gbB) {
  if (gbA && gbB && gbA !== gbB) {
    const targetGb = Math.min(gbA, gbB);
    const loserGb = Math.max(gbA, gbB);
    return { mode: "merge", targetGb, loserGb, gbTeamIdAllocated: false };
  }
  if (gbA && gbB) {
    return { mode: "same", targetGb: gbA, loserGb: null, gbTeamIdAllocated: false };
  }
  if (gbA || gbB) {
    return { mode: "reuse_one", targetGb: gbA || gbB, loserGb: null, gbTeamIdAllocated: false };
  }
  return { mode: "new", targetGb: null, loserGb: null, gbTeamIdAllocated: true };
}

/** 拖线前预览：说明将采用的 gb_team_id 及合并影响 */
async function previewLinkPlatformTeams({ a, b }) {
  const { platA, platB, idA, idB, gameCode } = validateTeamLinkPair(a, b);
  const mapA = await fetchTeamPlatformMap(platA, idA);
  const mapB = await fetchTeamPlatformMap(platB, idB);
  const gbA = parseGbTeamId(mapA?.canonical_id);
  const gbB = parseGbTeamId(mapB?.canonical_id);
  const plan = resolveTeamLinkGbPlan(gbA, gbB);
  const nameA = String(a?.platformName || mapA?.platform_name || idA).trim();
  const nameB = String(b?.platformName || mapB?.platform_name || idB).trim();

  let mapsReassigned = 0;
  if (plan.mode === "merge" && plan.loserGb != null) {
    mapsReassigned = await countTeamMapsForGbId(plan.loserGb);
  }

  return {
    ok: true,
    game: gameCode,
    mode: plan.mode,
    target_gb_team_id: plan.targetGb,
    loser_gb_team_id: plan.loserGb,
    maps_reassigned: mapsReassigned,
    will_allocate_gb_team_id: plan.gbTeamIdAllocated,
    team_a: {
      platform: platA,
      platform_id: idA,
      platform_name: nameA,
      gb_team_id: gbA,
      pending: Boolean(mapA && mapA.canonical_id == null),
    },
    team_b: {
      platform: platB,
      platform_id: idB,
      platform_name: nameB,
      gb_team_id: gbB,
      pending: Boolean(mapB && mapB.canonical_id == null),
    },
  };
}

/** 仅关联两平台的队伍 ID 到同一 canonical（不写 match_id、不 rebuild） */
async function linkPlatformTeams({ a, b }) {
  const { platA, platB, idA, idB, gameCode } = validateTeamLinkPair(a, b);
  const mapA = await fetchTeamPlatformMap(platA, idA);
  const mapB = await fetchTeamPlatformMap(platB, idB);
  const gbA = parseGbTeamId(mapA?.canonical_id);
  const gbB = parseGbTeamId(mapB?.canonical_id);
  const plan = resolveTeamLinkGbPlan(gbA, gbB);

  let gbTeamId = plan.targetGb;
  let mapsReassigned = 0;
  if (plan.mode === "merge" && plan.loserGb != null && gbTeamId != null) {
    mapsReassigned = await reassignGbTeamId(plan.loserGb, gbTeamId);
  }

  if (!gbTeamId) {
    const pickName = String(a?.platformName || mapA?.platform_name || b?.platformName || mapB?.platform_name || "").trim();
    if (!pickName || isPlaceholderTeamName(pickName)) throw new Error("队名为空，无法创建 canonical");
    try {
      gbTeamId = await resolveOrCreateManualTeam(gameCode, pickName);
    } catch (err) {
      const head = [
        "队伍关联失败：需要为标准队伍分配 gb_team_id",
        `A ${platA} · ${String(a?.platformName || mapA?.platform_name || idA).trim()}`,
        `B ${platB} · ${String(b?.platformName || mapB?.platform_name || idB).trim()}`,
        `游戏 ${gameCode} · 选用队名「${pickName}」`,
      ].join("\n");
      throw new Error(`${head}\n${err.message}`);
    }
  }

  const nameA = String(a?.platformName || mapA?.platform_name || idA).trim();
  const nameB = String(b?.platformName || mapB?.platform_name || idB).trim();

  const written = [];
  written.push(await upsertManualTeamPlatformMap(gbTeamId, platA, idA, nameA, gameCode));
  written.push(await upsertManualTeamPlatformMap(gbTeamId, platB, idB, nameB, gameCode));

  const label = String(gbTeamId);
  const mapsWritten = written.filter((r) => !r.skipped).length;
  let gbNote = "沿用已有 gb_team_id";
  if (plan.gbTeamIdAllocated) gbNote = "新分配 gb_team_id";
  else if (plan.mode === "merge") {
    gbNote = `合并 gb_team_id ${plan.loserGb} → ${label}（较小编号为准，已改写 ${mapsReassigned} 条映射）`;
  } else if (plan.mode === "same") gbNote = "两队已同属该 gb_team_id，刷新映射";
  else if (gbA || gbB) gbNote = "沿用一侧已有 gb_team_id";

  return {
    ok: true,
    action: "link_team",
    gb_team_id: label,
    canonical_id: label,
    gb_team_id_allocated: plan.gbTeamIdAllocated,
    gb_team_id_merged: plan.mode === "merge",
    gb_team_id_loser: plan.loserGb,
    maps_reassigned: mapsReassigned,
    game: gameCode,
    team_a: { platform: platA, platform_id: idA, platform_name: nameA },
    team_b: { platform: platB, platform_id: idB, platform_name: nameB },
    teamMapsWritten: mapsWritten,
    summary: `${platA} · ${nameA} ↔ ${platB} · ${nameB} → gb_team_id ${label}`,
    logLines: [
      `队伍关联成功 · gb_team_id ${label}（${gbNote}）`,
      `A ${platA} · ${nameA} · 平台 id ${idA}`,
      `B ${platB} · ${nameB} · 平台 id ${idB}`,
      `游戏 ${gameCode} · 写入 team_platform_maps ${mapsWritten} 条 · updated_by 手动`,
    ],
  };
}

async function registerTeamPlatformMap({ platform, platformId, platformName, gameCode }) {
  const plat = String(platform || "").trim();
  const pid = String(platformId || "").trim();
  const name = String(platformName || "").trim() || pid;
  const game = String(gameCode || "").trim();
  if (!plat || !pid) throw new Error("平台队伍 ID 不完整");
  if (!game || game === "unknown") throw new Error(`无法解析游戏类型（${plat} · ${name}）`);

  const existing = await db.fetchTeamPlatformMap(plat, pid);

  if (existing) {
    const displayName = String(existing.platform_name || name).trim() || pid;
    const gameLabel = String(existing.game || game).trim() || game;
    if (existing.canonical_id != null) {
      const err = new Error(
        `无需重复收录\n${plat} · ${displayName}\n平台 id ${pid} · 游戏 ${gameLabel}\n已有 gb_team_id ${existing.canonical_id}`
      );
      err.code = "already_registered";
      throw err;
    }
    const err = new Error(
      `无需重复收录\n${plat} · ${displayName}\n平台 id ${pid} · 游戏 ${gameLabel}\n已在 team_platform_maps，状态：待识别`
    );
    err.code = "already_registered";
    throw err;
  }

  const result = await upsertTeamPlatformRecord(plat, pid, name, game);
  if (result.skipped) throw new Error("平台队伍 ID 不完整");

  return {
    ok: true,
    action: "register_team_map",
    platform: plat,
    platform_id: pid,
    platform_name: name,
    game,
    status: "pending",
    summary: `${plat} · ${name} (id ${pid}) · ${game} → team_platform_maps（待识别）`,
    detail: `队伍「${name}」已收录，尚无 gb_team_id`,
    logLines: [
      `队伍收录成功 · 待识别（无 gb_team_id）`,
      `${plat} · ${name}`,
      `平台 id ${pid} · 游戏 ${game}`,
      `已写入 team_platform_maps`,
    ],
  };
}

export {
  linkPlatformToClientMatch,
  linkPlatformToPlatform,
  linkPlatformTeams,
  previewLinkPlatformTeams,
  registerTeamPlatformMap,
  analyzeSideAlignment,
  previewLinkAlignment,
  previewLinkPlatformAlignment,
};
