/**
 * Polymarket Sports WS 消息解析（纯函数，与 client/venue-adapter/polymarket/parse.ts 规则对齐）
 */

/** @param {string | undefined} period */
export function parsePeriodToCurrentMap(period) {
  if (!period)
    return null;
  const head = String(period).split("/")[0];
  const n = Number.parseInt(head, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** @param {string | undefined} score 例如 "000-000|1-0|Bo3" */
export function parseEsportsScore(score) {
  const raw = String(score || "").trim();
  if (!raw)
    return { mapScore: { home: 0, away: 0 }, bo: null, inMapScore: null };

  const parts = raw.split("|");
  const mapPart = parts[1] || "0-0";
  const boPart = parts[2] || "";
  const mapNums = mapPart.split("-").map(v => Number.parseInt(v, 10));
  const home = Number.isFinite(mapNums[0]) ? mapNums[0] : 0;
  const away = Number.isFinite(mapNums[1]) ? mapNums[1] : 0;
  const boMatch = /bo\s*(\d+)/i.exec(boPart);
  const bo = boMatch ? Number.parseInt(boMatch[1], 10) : null;

  return {
    inMapScore: parts[0] || null,
    mapScore: { home, away },
    bo: Number.isFinite(bo) && bo > 0 ? bo : null,
  };
}

/** @param {string | null | undefined} raw */
export function formatInMapScore(raw) {
  const s = String(raw || "").trim();
  if (!s)
    return "";
  const nums = s.split("-").map(v => Number.parseInt(v, 10));
  if (nums.length >= 2 && nums.every(n => Number.isFinite(n)))
    return `${nums[0]}-${nums[1]}`;
  return s;
}

/** @param {string | null | undefined} raw */
export function formatElapsed(raw) {
  const s = String(raw || "").trim();
  if (!s)
    return "";
  if (/^\d+$/.test(s)) {
    const sec = Number(s);
    if (!Number.isFinite(sec) || sec < 0)
      return "";
    const m = Math.floor(sec / 60);
    const ss = sec % 60;
    return `已进行${m}:${String(ss).padStart(2, "0")}`;
  }
  return `已进行${s}`;
}

/** @param {"home" | "away" | string | undefined} winner */
function flipMapWinnerSide(winner) {
  if (winner === "home")
    return "away";
  if (winner === "away")
    return "home";
  return winner;
}

/** @param {string | null | undefined} raw */
function swapInMapScoreParts(raw) {
  const s = String(raw || "").trim();
  if (!s)
    return raw ?? undefined;
  const parts = s.split("-");
  if (parts.length >= 2)
    return `${parts[1]}-${parts[0]}`;
  return s;
}

/**
 * 按 Title canonical 主客对齐 pm_sport（与 matcher swapBetSource 同语义）。
 * DB 仍存 PM 原生；GetMatchs overlay 在 Reverse 含 Polymarket 时调用。
 * @param {object | null | undefined} snapshot
 * @param {boolean} [reversed]
 */
export function alignPmSportSnapshot(snapshot, reversed = false) {
  if (!snapshot || typeof snapshot !== "object" || !reversed)
    return snapshot;

  const prevHomeTeam = snapshot.homeTeam;
  const prevAwayTeam = snapshot.awayTeam;
  const mapScore = snapshot.mapScore
    ? { home: snapshot.mapScore.away, away: snapshot.mapScore.home }
    : snapshot.mapScore;
  const inMapScore = snapshot.inMapScore != null
    ? swapInMapScoreParts(snapshot.inMapScore)
    : snapshot.inMapScore;
  const maps = Array.isArray(snapshot.maps)
    ? snapshot.maps.map((row) => {
        const winner = flipMapWinnerSide(row.winner);
        let winnerName = row.winnerName;
        if (row.winner === "home")
          winnerName = prevAwayTeam || row.winnerName;
        else if (row.winner === "away")
          winnerName = prevHomeTeam || row.winnerName;
        return { ...row, winner, winnerName };
      })
    : snapshot.maps;

  const aligned = {
    ...snapshot,
    homeTeam: prevAwayTeam,
    awayTeam: prevHomeTeam,
    mapScore,
    inMapScore,
    maps,
  };
  aligned.label = buildPmSportDisplayLine(aligned);
  return aligned;
}

/** @param {Array<{ map: number, winner: string }> | undefined} maps */
export function formatMapsWinners(maps) {
  if (!Array.isArray(maps) || !maps.length)
    return "";
  return maps.map((row) => {
    const side = row.winner === "home" ? "主" : row.winner === "away" ? "客" : "?";
    return `图${row.map}${side}`;
  }).join("·");
}

/** @param {string | null | undefined} raw */
export function formatResolutionSource(raw) {
  const s = String(raw || "").trim();
  if (!s)
    return "";
  try {
    const u = new URL(s);
    const host = u.hostname.replace(/^www\./i, "");
    const path = u.pathname.replace(/\/$/, "");
    if (path && path !== "/")
      return `来源 ${host}${path}`;
    return `来源 ${host}`;
  }
  catch {
    return `来源 ${s.replace(/^https?:\/\//i, "").replace(/^www\./i, "")}`;
  }
}

export function buildPmSportLabel({ status, ended, live, period, mapScore }) {
  const ms = mapScore || { home: 0, away: 0 };
  const scoreText = `${ms.home}-${ms.away}`;
  const st = String(status || "").toLowerCase();

  if (ended || st === "finished" || st === "final")
    return `已结束 · ${scoreText}`;
  if (st === "postponed")
    return "延期";
  if (st === "canceled" || st === "cancelled")
    return "取消";
  if (st === "not_started" || st === "scheduled")
    return "未开始";
  if (live || st === "running" || st === "inprogress") {
    const periodText = period ? String(period) : "";
    return periodText ? `进行中 · ${periodText} · ${scoreText}` : `进行中 · ${scoreText}`;
  }
  if (status)
    return `${status} · ${scoreText}`;
  return scoreText;
}

/** 单行展示：状态 + 图内小分 + 已进行 + 每图胜者 + 来源 */
export function buildPmSportDisplayLine(snapshot) {
  if (!snapshot)
    return "";
  const parts = [];
  const statusPart = buildPmSportLabel({
    status: snapshot.status,
    ended: snapshot.ended,
    live: snapshot.live,
    period: snapshot.period,
    mapScore: snapshot.mapScore,
  });
  if (statusPart)
    parts.push(statusPart);

  const inMap = formatInMapScore(snapshot.inMapScore);
  if (inMap)
    parts.push(`图内${inMap}`);

  const elapsed = formatElapsed(snapshot.elapsed);
  if (elapsed)
    parts.push(elapsed);

  const maps = formatMapsWinners(snapshot.maps);
  if (maps)
    parts.push(maps);

  const source = formatResolutionSource(snapshot.resolutionSource);
  if (source)
    parts.push(source);

  return parts.join(" · ");
}

/**
 * @param {object} msg Sports WS payload
 * @param {{ maps?: Array<{ map: number, winner: string, winnerName?: string }>, resolutionSource?: string } | null} prev
 */
export function buildPmSportSnapshot(msg, prev = null) {
  const parsed = parseEsportsScore(msg.score);
  const currentMap = parsePeriodToCurrentMap(msg.period);
  const homeTeam = String(msg.homeTeam || "").trim();
  const awayTeam = String(msg.awayTeam || "").trim();
  const status = String(msg.status || "").trim();
  const ended = msg.ended === true || status.toLowerCase() === "finished" || status === "Final";
  const live = msg.live === true;
  const inMapScore = parsed.inMapScore ? String(parsed.inMapScore) : undefined;
  const resolutionSource = msg.resolutionSource
    ? String(msg.resolutionSource)
    : (prev?.resolutionSource ? String(prev.resolutionSource) : undefined);

  let maps;
  if (Array.isArray(msg.maps) && msg.maps.length) {
    maps = msg.maps
      .map(row => ({
        map: Number(row.map),
        winner: row.winner,
        winnerName: row.winnerName ? String(row.winnerName) : undefined,
      }))
      .filter(row => Number.isFinite(row.map) && row.map > 0
        && (row.winner === "home" || row.winner === "away"));
    maps.sort((a, b) => a.map - b.map);
  }
  else {
    maps = Array.isArray(prev?.maps) ? [...prev.maps] : [];
    const prevMapScore = prev?.mapScore || { home: 0, away: 0 };
    const dh = parsed.mapScore.home - prevMapScore.home;
    const da = parsed.mapScore.away - prevMapScore.away;

    if (dh === 1 && da === 0)
      appendMapWinner(maps, parsed.mapScore.home + parsed.mapScore.away, "home", homeTeam);
    else if (da === 1 && dh === 0)
      appendMapWinner(maps, parsed.mapScore.home + parsed.mapScore.away, "away", awayTeam);
    else if (ended && maps.length < parsed.mapScore.home + parsed.mapScore.away) {
      const total = parsed.mapScore.home + parsed.mapScore.away;
      if (total > maps.length) {
        const winner = parsed.mapScore.home > parsed.mapScore.away ? "home" : "away";
        const winnerName = winner === "home" ? homeTeam : awayTeam;
        appendMapWinner(maps, total, winner, winnerName);
      }
    }
  }

  const snapshot = {
    gameId: msg.gameId != null ? Number(msg.gameId) : undefined,
    slug: msg.slug ? String(msg.slug) : undefined,
    leagueAbbreviation: msg.leagueAbbreviation ? String(msg.leagueAbbreviation) : undefined,
    homeTeam,
    awayTeam,
    status,
    live,
    ended,
    period: msg.period ? String(msg.period) : undefined,
    currentMap,
    bo: parsed.bo ?? undefined,
    scoreRaw: msg.score ? String(msg.score) : undefined,
    inMapScore,
    mapScore: parsed.mapScore,
    maps,
    elapsed: msg.elapsed ? String(msg.elapsed) : undefined,
    finishedTimestamp: msg.finished_timestamp ? String(msg.finished_timestamp) : undefined,
    resolutionSource,
    updatedAt: Date.now(),
  };
  snapshot.label = buildPmSportDisplayLine(snapshot);
  return snapshot;
}

/** @param {Array<{ map: number, winner: string, winnerName?: string }>} maps */
function appendMapWinner(maps, mapNo, winner, winnerName) {
  if (!mapNo || mapNo <= 0)
    return;
  if (maps.some(row => row.map === mapNo))
    return;
  maps.push({
    map: mapNo,
    winner,
    winnerName: winnerName || undefined,
  });
  maps.sort((a, b) => a.map - b.map);
}
