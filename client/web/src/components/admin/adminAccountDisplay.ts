import type { AccountEditFormState } from "@/components/account/accountEditFormState";
import type { AdminAccountDetail } from "@/types/admin";
import type { PlatformId } from "@/types/esport";
import {

  createAccountEditFormStateFromAdmin,
} from "@/components/account/accountEditFormState";
import { PlatformAccount, resolveAccountPauseReason } from "@/models/platformAccount";

export function adminAccountToPlatformAccount(acc: AdminAccountDetail): PlatformAccount {
  const provider = (acc.platform || "OB") as PlatformId;
  const account = new PlatformAccount({
    accountId: acc.accountId,
    platformId: acc.platformId,
    platformName: acc.platformName,
    playerName: acc.playerName,
    provider,
    proxyId: acc.proxyId,
    gateway: acc.gateway,
    token: acc.token,
    referer: acc.referer,
    userAgent: acc.userAgent,
    cookie: acc.cookie,
    credit: acc.credit,
    currency: acc.currency,
    today: acc.today,
    orderCount: acc.orderCount,
    unsettle: acc.unsettle,
    maxBalance: acc.maxBalance,
    maxBalanceOdds: acc.maxBalanceOdds,
    minOdds: acc.minOdds,
    maxOdds: acc.maxOdds,
    minDefault: acc.minDefault,
    maxDefault: acc.maxDefault,
    totalProfit: acc.totalProfit,
    maxProfit: acc.maxProfit,
    maxOrder: acc.maxOrder,
    todayOrder: acc.todayOrder,
    pause: acc.pause,
    markupOnly: acc.markupOnly,
    noMarkup: acc.noMarkup,
    active: acc.active,
    workTimes: acc.workTimes,
    winBalance: acc.winBalance,
    maxWinBalance: acc.maxWinBalance,
    profit: acc.profit,
    maxBetCount: acc.maxBetCount,
    multiply: acc.multiply,
    game: acc.game,
    rateConfig: acc.rateConfig,
    description: acc.description,
    realName: acc.realName,
    mobile: acc.mobile,
    city: acc.city,
    lastOdds: acc.lastOdds,
    updateTime: acc.updateTime,
  });
  account.balance = acc.balance;
  return account;
}

export interface AdminAccountDisplayRow {
  accountId: number;
  title: string;
  pauseReason: string | false;
  form: AccountEditFormState;
  proxyOptions: { label: string; value: number }[];
}

export function buildAdminAccountDisplayRows(accounts: AdminAccountDetail[]): AdminAccountDisplayRow[] {
  return accounts.map((acc) => {
    const provider = acc.platform || acc.platformName || "—";
    const pauseReason = resolveAccountPauseReason(acc);
    return {
      accountId: acc.accountId,
      title: `${provider} / ${acc.playerName || acc.platformName || acc.accountId}`,
      pauseReason,
      form: createAccountEditFormStateFromAdmin(acc),
      proxyOptions: [
        {
          label: acc.proxyId ? `代理 #${acc.proxyId}` : "无代理",
          value: acc.proxyId ?? 0,
        },
      ],
    };
  });
}
