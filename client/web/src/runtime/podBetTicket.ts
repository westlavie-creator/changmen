/**
 * POD 跟单票：门槛过线后给人看「买哪边、最低 OB、注码」。下单在跟单面板，自动默认关。
 */
import {
  formatPodOutcome,
  formatPodPeriod,
  type PodDropAlert,
} from "@/runtime/podAlerts";
import {
  podAlertBetFailReason,
  podAlertLineKind,
  type PodBetSettings,
  type PodLineKind,
} from "@/runtime/podBetSettings";

export type PodBetTicket = {
  id: string;
  alert: PodDropAlert;
  kind: PodLineKind;
  sideLabel: string;
  marketLabel: string;
  nvp: number;
  pinCurrent: number;
  pinPrevious: number;
  minObOdds: number;
  stake: number;
  dropPct: number;
  starts: number;
};

export function podAlertNvp(alert: Pick<PodDropAlert, "nvp" | "current">): number {
  if (alert.nvp > 1)
    return alert.nvp;
  return alert.current;
}

export function minObOddsForAlert(
  alert: Pick<PodDropAlert, "nvp" | "current">,
  settings: Pick<PodBetSettings, "minObEdgePct">,
): number {
  const nvp = podAlertNvp(alert);
  if (!(nvp > 1))
    return 0;
  return Math.round(nvp * (1 + settings.minObEdgePct / 100) * 1000) / 1000;
}

export function podAlertMarketLabel(alert: PodDropAlert): string {
  const kind = podAlertLineKind(alert);
  const period = formatPodPeriod(alert.period);
  const pts = alert.points;
  if (kind === "totals")
    return pts == null ? `${period} 大小` : `${period} 大小 ${pts}`;
  if (kind === "spreads")
    return pts == null ? `${period} 让球` : `${period} 让球`;
  if (kind === "moneyline")
    return `${period} 独赢`;
  return period;
}

export function buildPodBetTicket(
  alert: PodDropAlert,
  settings: PodBetSettings,
  now = Date.now(),
): PodBetTicket | null {
  if (podAlertBetFailReason(alert, settings, now) != null)
    return null;
  return {
    id: alert.id,
    alert,
    kind: podAlertLineKind(alert),
    sideLabel: formatPodOutcome(alert),
    marketLabel: podAlertMarketLabel(alert),
    nvp: podAlertNvp(alert),
    pinCurrent: alert.current,
    pinPrevious: alert.previous,
    minObOdds: minObOddsForAlert(alert, settings),
    stake: settings.stake,
    dropPct: alert.dropPct,
    starts: alert.starts,
  };
}

export function listPodFollowTickets(
  alerts: PodDropAlert[],
  settings: PodBetSettings,
  now = Date.now(),
): PodBetTicket[] {
  if (!settings.enabled)
    return [];
  const out: PodBetTicket[] = [];
  for (const alert of alerts) {
    const ticket = buildPodBetTicket(alert, settings, now);
    if (ticket)
      out.push(ticket);
  }
  return out;
}

export function formatPodStake(stake: number): string {
  if (!(stake > 0))
    return "注码未设";
  return `¥${Math.round(stake)}`;
}

export function formatPodKickoff(starts: number, now = Date.now()): string {
  if (!(starts > 0))
    return "开赛 —";
  const delta = starts - now;
  if (delta <= 0)
    return "已开赛";
  if (delta < 60_000)
    return `${Math.max(1, Math.round(delta / 1000))}秒后开`;
  const min = Math.round(delta / 60_000);
  if (min < 60)
    return `${min}分钟后开`;
  const hr = Math.floor(min / 60);
  const rest = min % 60;
  return rest ? `${hr}小时${rest}分后开` : `${hr}小时后开`;
}
