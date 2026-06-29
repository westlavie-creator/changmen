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

/**
 * @param {object} msg Sports WS payload
 * @param {{ maps?: Array<{ map: number, winner: string, winnerName?: string }> } | null} prev
 */
export function buildPmSportSnapshot(msg, prev = null) {
  const parsed = parseEsportsScore(msg.score);
  const currentMap = parsePeriodToCurrentMap(msg.period);
  const homeTeam = String(msg.homeTeam || "").trim();
  const awayTeam = String(msg.awayTeam || "").trim();
  const status = String(msg.status || "").trim();
  const ended = msg.ended === true || status.toLowerCase() === "finished" || status === "Final";
  const live = msg.live === true;

  const maps = Array.isArray(prev?.maps) ? [...prev.maps] : [];
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

  const label = buildPmSportLabel({ status, ended, live, period: msg.period, mapScore: parsed.mapScore });

  return {
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
    mapScore: parsed.mapScore,
    maps,
    elapsed: msg.elapsed ? String(msg.elapsed) : undefined,
    finishedTimestamp: msg.finished_timestamp ? String(msg.finished_timestamp) : undefined,
    label,
    updatedAt: Date.now(),
  };
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
