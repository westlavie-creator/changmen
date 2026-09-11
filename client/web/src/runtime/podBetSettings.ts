/**
 * POD 跟单门槛。只存在本机 localStorage，不进 USERCONFIG / ACCOUNT。
 * 用于筛「可以拿去对 OB 的警报」，不自动下单。
 */
import type { PodDropAlert } from "@/runtime/podAlerts";

export const POD_BET_SETTINGS_KEY = "changmen:podBetSettings";
export const POD_BET_SETTINGS_UPDATED = "changmen:pod-bet-settings-updated";
export const POD_FOLLOW_STAKE_PRESETS = [50, 100, 200, 500] as const;

export type PodBetSettings = {
  /** 开：跟单浮窗列出过门槛的警报 */
  enabled: boolean;
  /** 只跟未开赛（滚球 OB 往往比 Pinnacle 更快） */
  prematchOnly: boolean;
  /** 只要足球（POD sportId=1） */
  footballOnly: boolean;
  /** 含半场。默认只全场 */
  includeHt: boolean;
  moneyline: boolean;
  totals: boolean;
  /** OB 让球通常已经很锐，默认关 */
  spreads: boolean;
  /** 最小降幅 % */
  minDropPct: number;
  /** 对 OB 时：报价须高于 NVP 的最小边 %（面板暂无 OB 价，只存门槛） */
  minObEdgePct: number;
  minOdds: number;
  maxOdds: number;
  /** 警报过期秒数 */
  maxAgeSec: number;
  /** 计划跟单下注金额（元）；0 = 未设 */
  stake: number;
};

export const POD_BET_SETTINGS_DEFAULTS: PodBetSettings = {
  enabled: true,
  prematchOnly: true,
  footballOnly: true,
  includeHt: false,
  moneyline: true,
  totals: true,
  spreads: false,
  minDropPct: 8,
  minObEdgePct: 4,
  minOdds: 1.45,
  maxOdds: 3.2,
  maxAgeSec: 45,
  stake: 0,
};

function asRecord(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : null;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function clampNum(v: unknown, fallback: number, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n))
    return fallback;
  return Math.min(max, Math.max(min, n));
}

export function parsePodBetSettings(raw: unknown): PodBetSettings {
  const row = asRecord(raw) || {};
  const d = POD_BET_SETTINGS_DEFAULTS;
  const lo = clampNum(row.minOdds, d.minOdds, 1.01, 20);
  const hi = clampNum(row.maxOdds, d.maxOdds, 1.05, 50);
  const moneyline = bool(row.moneyline, d.moneyline);
  const totals = bool(row.totals, d.totals);
  const spreads = bool(row.spreads, d.spreads);
  const anyMarket = moneyline || totals || spreads;
  return {
    enabled: bool(row.enabled, d.enabled),
    prematchOnly: bool(row.prematchOnly, d.prematchOnly),
    footballOnly: bool(row.footballOnly, d.footballOnly),
    includeHt: bool(row.includeHt, d.includeHt),
    moneyline: anyMarket ? moneyline : d.moneyline,
    totals: anyMarket ? totals : d.totals,
    spreads: anyMarket ? spreads : d.spreads,
    minDropPct: clampNum(row.minDropPct, d.minDropPct, 0, 80),
    minObEdgePct: clampNum(row.minObEdgePct, d.minObEdgePct, 0, 40),
    minOdds: Math.min(lo, hi),
    maxOdds: Math.max(lo, hi),
    maxAgeSec: Math.round(clampNum(row.maxAgeSec, d.maxAgeSec, 5, 600)),
    stake: clampNum(row.stake, d.stake, 0, 1_000_000),
  };
}

export type PodLineKind = "moneyline" | "totals" | "spreads" | "other";

export function podAlertLineKind(alert: Pick<PodDropAlert, "lineType" | "market" | "outcome">): PodLineKind {
  const text = `${alert.lineType} ${alert.market}`.toLowerCase();
  const outcome = String(alert.outcome || "").toLowerCase();
  if (/total|totals|\bou\b|over\/under|大小/.test(text) || outcome === "over" || outcome === "under")
    return "totals";
  if (/spread|spreads|handicap|\bah\b|让/.test(text))
    return "spreads";
  if (/moneyline|\bml\b|1x2|独赢|match winner/.test(text) || outcome === "draw")
    return "moneyline";
  if ((outcome === "home" || outcome === "away") && !/spread|total/.test(text))
    return "moneyline";
  return "other";
}

function isFootballAlert(alert: PodDropAlert): boolean {
  if (Number(alert.sportId) === 1)
    return true;
  return /football|soccer/i.test(alert.sport);
}

function alertOdds(alert: PodDropAlert): number {
  if (alert.nvp > 1)
    return alert.nvp;
  return alert.current;
}

export type PodBetGateFail =
  | "disabled"
  | "age"
  | "sport"
  | "live"
  | "period"
  | "market"
  | "drop"
  | "odds";

export function podAlertBetFailReason(
  alert: PodDropAlert,
  settings: PodBetSettings,
  now = Date.now(),
): PodBetGateFail | null {
  if (!settings.enabled)
    return "disabled";
  if (settings.maxAgeSec > 0 && !Number.isFinite(alert.alertedAt))
    return "age";
  if (settings.maxAgeSec > 0 && now - alert.alertedAt > settings.maxAgeSec * 1000)
    return "age";
  if (settings.footballOnly && !isFootballAlert(alert))
    return "sport";
  if (settings.prematchOnly) {
    const start = Number(alert.starts) || 0;
    if (!(start > now))
      return "live";
  }
  const period = Number(alert.period) || 0;
  if (period === 1 && !settings.includeHt)
    return "period";
  if (period !== 0 && period !== 1)
    return "period";
  const kind = podAlertLineKind(alert);
  if (kind === "moneyline" && !settings.moneyline)
    return "market";
  if (kind === "totals" && !settings.totals)
    return "market";
  if (kind === "spreads" && !settings.spreads)
    return "market";
  if (kind === "other")
    return "market";
  if (alert.dropPct < settings.minDropPct)
    return "drop";
  const odds = alertOdds(alert);
  if (!(odds >= settings.minOdds && odds <= settings.maxOdds))
    return "odds";
  return null;
}

export function podAlertPassesBetGate(
  alert: PodDropAlert,
  settings: PodBetSettings,
  now = Date.now(),
): boolean {
  if (!settings.enabled)
    return true;
  return podAlertBetFailReason(alert, settings, now) == null;
}

export function filterPodAlertsForBet(
  alerts: PodDropAlert[],
  settings: PodBetSettings,
  now = Date.now(),
): PodDropAlert[] {
  if (!settings.enabled)
    return alerts;
  return alerts.filter(a => podAlertPassesBetGate(a, settings, now));
}

export function readPodBetSettings(): PodBetSettings {
  try {
    const raw = localStorage.getItem(POD_BET_SETTINGS_KEY);
    if (!raw)
      return { ...POD_BET_SETTINGS_DEFAULTS };
    return parsePodBetSettings(JSON.parse(raw));
  }
  catch {
    return { ...POD_BET_SETTINGS_DEFAULTS };
  }
}

export function writePodBetSettings(next: PodBetSettings): PodBetSettings {
  const row = parsePodBetSettings(next);
  const json = JSON.stringify(row);
  try {
    if (localStorage.getItem(POD_BET_SETTINGS_KEY) === json)
      return row;
    localStorage.setItem(POD_BET_SETTINGS_KEY, json);
  }
  catch { /* quota */ }
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event(POD_BET_SETTINGS_UPDATED));
  return row;
}
