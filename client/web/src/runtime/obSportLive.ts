/**
 * OB 体育推送里的比赛态（比分 / 节次 / 时钟）。只给足球页展示，不进电竞 liveTimer。
 */

export type ObSportLiveMatch = {
  mid: string;
  home: number | null;
  away: number | null;
  mmp: string;
  elapsedSec: number;
  ms: number;
  updatedAt: number;
};

export type ObSportLivePatch = Partial<Omit<ObSportLiveMatch, "mid">> & {
  mid: string;
  /** C302 开赛：未知 mid 才补拉列表，C102/C105 不要整表刷新 */
  refreshList?: boolean;
};

/** 试玩页 mmp 对照：6=上半、7=下半（滚球实测） */
const MMP_LABEL: Record<string, string> = {
  "0": "未开赛",
  "1": "上半场",
  "2": "下半场",
  "6": "上半场",
  "7": "下半场",
  "13": "Q1",
  "14": "Q2",
  "15": "Q3",
  "16": "Q4",
  "31": "中场",
  "32": "加时待开",
  "40": "加时",
  "41": "加时上",
  "42": "加时下",
  "50": "点球",
  "80": "中断",
  "90": "完场",
  "100": "完场",
  "110": "加时",
  "999": "完场",
};

export function parseMscScore(msc: unknown): { home: number; away: number } | null {
  const list = Array.isArray(msc) ? msc : [];
  const s0 = list.map(x => String(x || "")).find(s => /^S0\|/i.test(s));
  const raw = s0 ? s0.slice(s0.indexOf("|") + 1) : "";
  const m = raw.match(/^(-?\d+)\s*:\s*(-?\d+)/);
  if (!m)
    return null;
  return { home: Number(m[1]), away: Number(m[2]) };
}

export function mergeObSportLivePatch(
  prev: ObSportLiveMatch | undefined,
  patch: ObSportLivePatch,
  now = Date.now(),
): ObSportLiveMatch {
  return {
    mid: patch.mid,
    home: patch.home ?? prev?.home ?? null,
    away: patch.away ?? prev?.away ?? null,
    mmp: patch.mmp ?? prev?.mmp ?? "",
    elapsedSec: patch.elapsedSec ?? prev?.elapsedSec ?? 0,
    ms: patch.ms ?? prev?.ms ?? 0,
    updatedAt: now,
  };
}

export function parseObSportMatchLive(msg: unknown): ObSportLivePatch | null {
  if (!msg || typeof msg !== "object")
    return null;
  const root = msg as Record<string, unknown>;
  const cmd = String(root.cmd || root.CMD || "").toUpperCase();
  const cd = root.cd;
  if (cmd === "C109" && Array.isArray(cd)) {
    const row = cd.find(x => x && typeof x === "object") as Record<string, unknown> | undefined;
    const mid = String(row?.mid || "").trim();
    if (!mid)
      return null;
    return { mid, ms: Number(row?.ms) || 0 };
  }
  if (!cd || typeof cd !== "object" || Array.isArray(cd))
    return null;
  const body = cd as Record<string, unknown>;
  const mid = String(body.mid || "").trim();
  if (!mid)
    return null;
  if (cmd === "C103") {
    const score = parseMscScore(body.msc);
    const patch: ObSportLivePatch = { mid };
    if (score) {
      patch.home = score.home;
      patch.away = score.away;
    }
    if (body.mpid != null && String(body.mpid).trim())
      patch.mmp = String(body.mpid);
    return patch;
  }
  if (cmd === "C102") {
    const patch: ObSportLivePatch = { mid, ms: 1 };
    if (body.mmp != null && String(body.mmp).trim())
      patch.mmp = String(body.mmp);
    const sec = Number(body.mst ?? body.msts);
    if (Number.isFinite(sec) && sec >= 0)
      patch.elapsedSec = Math.floor(sec);
    return patch;
  }
  if (cmd === "C302") {
    const csid = String(body.csid ?? "");
    if (csid && csid !== "1")
      return null;
    return { mid, ms: 1, refreshList: true };
  }
  if (cmd === "C105" || cmd === "C101") {
    const patch: ObSportLivePatch = { mid };
    if (body.ms != null && body.ms !== "")
      patch.ms = Number(body.ms) || 0;
    return patch;
  }
  return null;
}

export function parseObSportHandicapPlay(msg: unknown): { mid: string; hpid: string } | null {
  if (!msg || typeof msg !== "object")
    return null;
  const root = msg as Record<string, unknown>;
  if (String(root.cmd || root.CMD || "").toUpperCase() !== "C303")
    return null;
  const cd = root.cd && typeof root.cd === "object" && !Array.isArray(root.cd)
    ? root.cd as Record<string, unknown>
    : null;
  const mid = String(cd?.mid || "").trim();
  if (!mid)
    return null;
  return { mid, hpid: String(cd?.hpid || "").trim() };
}

export function obSportPeriodLabel(mmp: string): string {
  const key = String(mmp || "").trim();
  return MMP_LABEL[key] || (key ? `P${key}` : "");
}

export function obSportMatchInPlay(live: ObSportLiveMatch | null | undefined): boolean {
  if (!live)
    return false;
  const ms = Number(live.ms);
  if (ms === 110 || ms === 0)
    return false;
  const mmp = String(live.mmp || "");
  if (["90", "100", "999"].includes(mmp))
    return false;
  return ms === 1 || live.home != null || live.elapsedSec > 0 || Boolean(mmp);
}

export function formatObSportElapsed(live: ObSportLiveMatch | null | undefined, now = Date.now()): string {
  if (!live)
    return "";
  let sec = Number(live.elapsedSec) || 0;
  if (obSportMatchInPlay(live) && live.updatedAt > 0) {
    const drift = Math.floor((now - live.updatedAt) / 1000);
    if (drift > 0 && drift < 120)
      sec += drift;
  }
  if (sec < 0)
    sec = 0;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatObSportScore(live: ObSportLiveMatch | null | undefined): string {
  if (!live || live.home == null || live.away == null)
    return "";
  return `${live.home} - ${live.away}`;
}
