import { BetResult } from "@/models/betResult";
import type { PlatformAccount } from "@/models/platformAccount";
import {
  sortVenueOrdersNewestFirst,
  type PlatformProvider,
  type VenueOrder,
  type VenueOrderStatus,
} from "@platform/contract";
import { iaPointBettable } from "@platform/ia/shared/parse_fields";
import { useMessageStore } from "@/stores/messageStore";
import { accountIaPost } from "@/shared/platformHttp";
import { PLATFORMS } from "@/shared/platform";
import { wait } from "@/shared/wait";

interface IaLimitResponse {
  code?: number;
  msg?: string;
  data?: { money_min?: number; money_max?: number };
}

interface IaTeamPoint {
  id?: string | number;
  status?: number;
  point?: number;
}

interface IaChildPlay {
  id?: string | number;
  status?: number;
  team_points?: IaTeamPoint[];
}

interface IaPlaysResponse {
  code?: number;
  msg?: string;
  data?: { plays?: Array<{ child_plays?: IaChildPlay[] }> };
}

interface IaBetResponse {
  code?: number;
  msg?: string;
  data?: {
    status?: number;
    error?: number;
    ext?: Array<{ msg?: string; new_odd?: string | number }>;
  };
}

interface IaHistoryRow {
  order_id?: string | number;
  odds?: number;
  create_time?: number;
  amount?: number;
  bonus?: number;
  desc?: string;
  team_name_1?: string;
  team_name_2?: string;
  is_cancel?: number;
  receive_status?: number;
  prize_status?: number;
  game_name?: string;
}

interface IaHistoryResponse {
  code?: number;
  data?: { data?: IaHistoryRow[] };
}

/** 对齐 A8 `CYe.getOrders` 单行映射 */
export function mapIaHistoryRow(
  row: IaHistoryRow,
  provider: PlatformAccount["provider"],
): VenueOrder {
  let reward = 0;
  let money = 0;
  let status: VenueOrderStatus = "none";
  const desc = String(row.desc ?? "");
  let bet = "";
  let item = "";
  const t1 = String(row.team_name_1 ?? "");
  const t2 = String(row.team_name_2 ?? "");
  let splitAt = desc.indexOf(t1);
  if (splitAt === -1) splitAt = desc.indexOf(t2);
  if (splitAt !== -1) {
    bet = desc.substring(0, splitAt - 1);
    item = desc.substring(splitAt);
  } else {
    bet = desc;
  }

  if (row.is_cancel === 1) {
    status = "return";
  } else if (row.receive_status === 1) {
    status = "pending";
  } else if (row.receive_status === 2) {
    status = "reject";
  } else {
    switch (row.prize_status) {
      case 0:
        status = "none";
        break;
      case 1:
        status = "win";
        reward = Number(row.bonus) || 0;
        money = reward - (Number(row.amount) || 0);
        break;
      case 2:
        status = "lose";
        money = reward - (Number(row.amount) || 0);
        break;
      default:
        status = "none";
    }
  }

  return {
    provider: provider ?? PLATFORMS.IA,
    orderId: String(row.order_id ?? ""),
    odds: Number(row.odds) || 0,
    createAt: (Number(row.create_time) || 0) * 1000,
    betMoney: Number(row.amount) || 0,
    reward,
    money,
    status,
    game: String(row.game_name ?? ""),
    match: [t1, t2].filter(Boolean).join(" vs "),
    bet,
    item,
  };
}

function findPoint(plays: IaPlaysResponse, betId: string, itemId: string): IaTeamPoint | null {
  for (const play of plays.data?.plays ?? []) {
    for (const child of play.child_plays ?? []) {
      if (String(child.id) !== String(betId) || !iaPointBettable(child.status)) continue;
      for (const pt of child.team_points ?? []) {
        if (String(pt.id) === String(itemId)) return pt;
      }
    }
  }
  return null;
}

export const iaProvider: PlatformProvider = {
  async getBalance(account) {
    if (!account.gateway || !account.token) return undefined;
    try {
      const res = await accountIaPost<{ code?: number; data?: { amount?: number } }>(
        account,
        "/api/game/user/balance",
        "lang=1",
      );
      if (!res || res.code !== 1) return undefined;
      return {
        currency: "CNY",
        balance: Number(res.data?.amount) || 0,
      };
    } catch {
      return undefined;
    }
  },

  async getOrders(account) {
    if (!account.gateway || !account.token) return [];
    const endSec = Math.floor(Date.now() / 1000);
    let orders: VenueOrder[] = [];
    let hasPending = true;

    while (hasPending) {
      orders = [];
      const body = `start_time=${endSec - 604_800}&end_time=${endSec}&page=1&limit=50&lang=1`;
      const res = await accountIaPost<IaHistoryResponse>(
        account,
        "/api/game/user/getUserHistory/",
        body,
        { forceDirect: true },
      );
      for (const row of res.data?.data ?? []) {
        orders.push(mapIaHistoryRow(row, account.provider));
      }
      hasPending = orders.some((o) => o.status === "pending");
      if (hasPending) await wait(3000);
    }

    return sortVenueOrdersNewestFirst(orders);
  },

  async checkBet(account, option) {
    let liveOdds = 0;
    const limitPath = "/api/game/game/getOrdinaryLimitInfo/";
    const limitBody = `game_id=${option.matchId}&play_id=${option.betId}&point_id=${option.itemId}&is_champion=0&lang=1`;
    option.request = { url: limitPath, data: limitBody };

    const limit = await accountIaPost<IaLimitResponse>(account, limitPath, limitBody);
    option.response = limit;
    if (limit.code !== 1 || !limit.data?.money_max) {
      option.checkError = limit.msg || "限红查询失败";
      return option;
    }
    if (
      option.betMoney < (limit.data.money_min ?? 0) ||
      option.betMoney > limit.data.money_max
    ) {
      option.checkError = useMessageStore().limitMessage(account, {
        match: option.match?.title,
        bet: option.bet?.getBetName(),
        odds: option.odds,
        betMoney: option.betMoney,
        limit: limit.data.money_max,
      });
      return option;
    }

    try {
      const plays = await accountIaPost<IaPlaysResponse>(
        account,
        "/api/game/game/getPointsListSplit",
        `game_id=${option.matchId}&lang=1`,
      );
      option.response = plays;
      if (plays.code !== 1) {
        option.checkError = plays.msg || "获取盘口失败";
        return option;
      }

      const point = findPoint(plays, option.betId, option.itemId);
      if (point) option.response = point;
      if (!point || !iaPointBettable(point.status)) {
        option.checkError = "盘口已封盘";
        return option;
      }

      liveOdds = Number(point.point) || 0;
      if (!liveOdds || liveOdds < option.odds - 0.01) {
        option.checkError = `当前赔率:${liveOdds || 0}`;
        option.updateOdds(liveOdds);
        return option;
      }

      option.data = {
        items: JSON.stringify([
          {
            point_extra_id: option.itemId,
            money: option.betMoney,
            odd: liveOdds,
          },
        ]),
        odd_change_type: 1,
        lang: 1,
      };
      return option;
    } finally {
      if (liveOdds) option.updateOdds(liveOdds);
    }
  },

  async betting(account, option) {
    const body = new URLSearchParams(
      Object.fromEntries(
        Object.entries(option.data ?? {}).map(([k, v]) => [k, String(v)]),
      ),
    ).toString();
    const res = await accountIaPost<IaBetResponse>(account, "/api/game/user/playMore/", body);
    const ok = res.data?.status === 1;
    let message = res.msg || "";
    if (!ok) {
      let newOdds = 0;
      const ext = res.data?.ext?.[0];
      if (ext) {
        if (res.data?.error === 110019) {
          message = `${ext.msg ?? ""}${ext.new_odd ?? ""}`;
          newOdds = Number(ext.new_odd) || 0;
        } else {
          message = ext.msg || message;
        }
      }
      if (newOdds) option.updateOdds(newOdds);
    }
    const result = new BetResult(account.provider, ok, message || (ok ? "下单成功" : "下单失败"), option.data, res);
    return result;
  },
};
