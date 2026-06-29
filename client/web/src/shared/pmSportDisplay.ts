import type { PmSportSnapshot } from "@/types/esport";

export type PmSportDisplayPart =
  | { kind: "text"; text: string }
  | { kind: "link"; text: string; href: string };

function formatInMapScore(raw: string | null | undefined): string {
  const s = String(raw ?? "").trim();
  if (!s)
    return "";
  const nums = s.split("-").map(v => Number.parseInt(v, 10));
  if (nums.length >= 2 && nums.every(n => Number.isFinite(n)))
    return `图内${nums[0]}-${nums[1]}`;
  return `图内${s}`;
}

function formatElapsed(raw: string | null | undefined): string {
  const s = String(raw ?? "").trim();
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

function formatMapsWinners(maps: PmSportSnapshot["maps"]): string {
  if (!Array.isArray(maps) || !maps.length)
    return "";
  return maps.map((row) => {
    const side = row.winner === "home" ? "主" : row.winner === "away" ? "客" : "?";
    return `图${row.map}${side}`;
  }).join("·");
}

export function formatResolutionSourceLabel(raw: string | undefined): string {
  const s = String(raw ?? "").trim();
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

export function normalizeResolutionSourceHref(raw: string | undefined): string {
  const s = String(raw ?? "").trim();
  if (!s)
    return "";
  try {
    return new URL(s).href;
  }
  catch {
    return `https://${s.replace(/^https?:\/\//i, "")}`;
  }
}

function buildStatusLabel(snapshot: PmSportSnapshot): string {
  const ms = snapshot.mapScore || { home: 0, away: 0 };
  const scoreText = `${ms.home}-${ms.away}`;
  const st = String(snapshot.status || "").toLowerCase();

  if (snapshot.ended || st === "finished" || st === "final")
    return `已结束 · ${scoreText}`;
  if (st === "postponed")
    return "延期";
  if (st === "canceled" || st === "cancelled")
    return "取消";
  if (st === "not_started" || st === "scheduled")
    return "未开始";
  if (snapshot.live || st === "running" || st === "inprogress") {
    const periodText = snapshot.period ? String(snapshot.period) : "";
    return periodText ? `进行中 · ${periodText} · ${scoreText}` : `进行中 · ${scoreText}`;
  }
  if (snapshot.status)
    return `${snapshot.status} · ${scoreText}`;
  return scoreText;
}

function partsFromLabel(snapshot: PmSportSnapshot): PmSportDisplayPart[] {
  const label = String(snapshot.label ?? "").trim();
  if (!label)
    return [];

  const src = String(snapshot.resolutionSource ?? "").trim();
  if (!src)
    return [{ kind: "text", text: label }];

  const srcLabel = formatResolutionSourceLabel(src);
  const href = normalizeResolutionSourceHref(src);
  return label.split(" · ").map((segment) => {
    const text = segment.trim();
    if (!text)
      return null;
    if (text === srcLabel || text.startsWith("来源 "))
      return { kind: "link" as const, text, href };
    return { kind: "text" as const, text };
  }).filter((part): part is PmSportDisplayPart => part != null);
}

function partsFromSnapshot(snapshot: PmSportSnapshot): PmSportDisplayPart[] {
  const parts: PmSportDisplayPart[] = [];
  const statusPart = buildStatusLabel(snapshot);
  if (statusPart)
    parts.push({ kind: "text", text: statusPart });

  const inMap = formatInMapScore(snapshot.inMapScore);
  if (inMap)
    parts.push({ kind: "text", text: inMap });

  const elapsed = formatElapsed(snapshot.elapsed);
  if (elapsed)
    parts.push({ kind: "text", text: elapsed });

  const maps = formatMapsWinners(snapshot.maps);
  if (maps)
    parts.push({ kind: "text", text: maps });

  const src = String(snapshot.resolutionSource ?? "").trim();
  if (src) {
    parts.push({
      kind: "link",
      text: formatResolutionSourceLabel(src),
      href: normalizeResolutionSourceHref(src),
    });
  }
  return parts;
}

/** 与 server parse_sport 单行 label 对齐；来源 URL 单独成 link 段 */
export function buildPmSportDisplayParts(snapshot: PmSportSnapshot | undefined): PmSportDisplayPart[] {
  if (!snapshot)
    return [];

  const structured = partsFromSnapshot(snapshot);
  if (structured.length)
    return structured;

  return partsFromLabel(snapshot);
}
