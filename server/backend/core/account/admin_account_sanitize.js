/**
 * 管理端账号投影（DTO），供 admin_service / admin_pf 共用，避免循环依赖。
 */
import { resolveAccountMultiply } from "@changmen/shared/account_multiply";
import { resolveAccountCurrency } from "@changmen/shared/currency";

/** 管理端账号：含 gateway/token/referer 等完整凭证（仅 Client_Admin* 接口，需 is_admin） */
export function sanitizeAccountForAdmin(raw) {
  if (!raw || typeof raw !== "object")
    return null;
  const a = raw;
  const gateway = String(a.gateway ?? a.Gateway ?? "");
  let gatewayHost = "";
  if (gateway) {
    try {
      gatewayHost = new URL(gateway).host;
    }
    catch {
      gatewayHost = gateway.length > 48 ? `${gateway.slice(0, 45)}…` : gateway;
    }
  }
  const game = a.game && typeof a.game === "object" ? a.game : {};
  return {
    accountId: Number(a.accountId ?? a.AccountId) || 0,
    platform: String(a.provider ?? a.Provider ?? a.platform ?? a.Platform ?? a.Type ?? ""),
    platformId: Number(a.platformId ?? a.PlatformId) || 0,
    platformName: String(a.platformName ?? a.PlatformName ?? ""),
    playerName: String(a.playerName ?? a.PlayerName ?? ""),
    balance: Number(a.balance ?? a.Balance) || 0,
    credit: Number(a.credit ?? a.Credit) || 0,
    currency: resolveAccountCurrency(
      a.provider ?? a.Provider ?? a.platform ?? a.Platform,
      a.currency ?? a.Currency,
    ),
    winBalance: Number(a.winBalance ?? a.WinBalance) || 0,
    unsettle: Number(a.unsettle ?? a.Unsettle) || 0,
    proxyId: Number(a.proxyId ?? a.ProxyId) || 0,
    pause: Boolean(a.pause ?? a.Pause),
    markupOnly: Boolean(a.markupOnly ?? a.MarkupOnly),
    noMarkup: Boolean(a.noMarkup ?? a.NoMarkup),
    active: Boolean(a.active ?? a.Active),
    minOdds: Number(a.minOdds ?? a.MinOdds) || 0,
    maxOdds: Number(a.maxOdds ?? a.MaxOdds) || 0,
    minDefault: Number(a.minDefault ?? a.MinDefault) || 0,
    maxDefault: Number(a.maxDefault ?? a.MaxDefault) || 0,
    profit: Number(a.profit ?? a.Profit) || 0,
    maxProfit: Number(a.maxProfit ?? a.MaxProfit) || 0,
    maxBetCount: Number(a.maxBetCount ?? a.MaxBetCount) || 0,
    maxOrder: Number(a.maxOrder ?? a.MaxOrder) || 0,
    todayOrder: Number(a.todayOrder ?? a.TodayOrder) || 0,
    today: Number(a.today ?? a.Today) || 0,
    orderCount: Number(a.orderCount ?? a.OrderCount) || 0,
    totalProfit: Number(a.totalProfit ?? a.TotalProfit) || 0,
    maxBalance: Number(a.maxBalance ?? a.MaxBalance) || 0,
    maxWinBalance: Number(a.maxWinBalance ?? a.MaxWinBalance) || 0,
    description: String(a.description ?? a.Description ?? ""),
    realName: String(a.realName ?? a.RealName ?? ""),
    mobile: String(a.mobile ?? a.Mobile ?? ""),
    city: String(a.city ?? a.City ?? ""),
    gateway: gateway || undefined,
    token: a.token ?? a.Token ? String(a.token ?? a.Token) : undefined,
    referer: a.referer ?? a.Referer ? String(a.referer ?? a.Referer) : undefined,
    userAgent: a.userAgent ?? a.UserAgent ? String(a.userAgent ?? a.UserAgent) : undefined,
    cookie: a.cookie ?? a.Cookie ? String(a.cookie ?? a.Cookie) : undefined,
    maxBalanceOdds: Number(a.maxBalanceOdds ?? a.MaxBalanceOdds) || 2,
    lastOdds: Boolean(a.lastOdds ?? a.LastOdds),
    multiply: resolveAccountMultiply(
      a.provider ?? a.Provider ?? a.platform ?? a.Platform,
      a.multiply ?? a.Multiply,
    ),
    workTimes: Array.isArray(a.workTimes) ? a.workTimes.map(String) : [],
    rateConfig: Array.isArray(a.rateConfig)
      ? a.rateConfig.map(r => ({
          minOdds: Number(r?.minOdds) || 0,
          maxOdds: Number(r?.maxOdds) || 0,
          rate: Number(r?.rate) || 0,
        }))
      : [],
    game: Object.fromEntries(
      Object.entries(game).map(([name, g]) => [
        name,
        {
          betCount: Number(g?.betCount) || 0,
          profit: Number(g?.profit) || 0,
          odds: Array.isArray(g?.odds) ? g.odds.map(String) : [],
        },
      ]),
    ),
    gatewayHost,
    hasCredentials: Boolean(a.token ?? a.Token ?? a.cookie ?? a.Cookie),
    updateTime: Number(a.updateTime ?? a.UpdateTime) || 0,
    venueMemberId: (() => {
      const v = a.venueMemberId ?? a.venueId;
      return v != null && String(v).trim() ? String(v).trim() : undefined;
    })(),
    venueAccountName: a.venueAccountName != null && String(a.venueAccountName).trim()
      ? String(a.venueAccountName).trim()
      : undefined,
  };
}
