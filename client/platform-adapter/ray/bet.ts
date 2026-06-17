import { parseVenueCreateAt } from "@changmen/shared/time/match_time.mjs";
import { BetResult } from "@/models/betResult";
import type { PlatformProvider, VenueOrder, VenueOrderStatus } from "@platform/contract";
import { accountGet, accountPostForm } from "@/shared/platformHttp";
import { getCurrency } from "@/shared/currency";
import { PLATFORMS } from "@/shared/platform";
import { useMessageStore } from "@/stores/messageStore";

interface RayOddsRow {
  odds_id: string | number;
  enable_parlay?: number;
  status?: number;
  odds?: number | string;
  bet_limit?: [number, number];
  group_name?: string;
  name?: string;
  match_name?: string;
  match_stage?: string;
  odds_group_id?: number;
  value?: unknown;
  win?: unknown;
  last_update?: unknown;
  group_short_name?: string;
  id?: number;
  team_id?: number;
  match_id?: number;
  tag?: unknown;
  game_id?: number;
  start_time?: string;
}

interface RayOrderDetail {
  title?: string;
  odds?: number | string;
  stake?: number;
  game_id?: number | string;
  match_name?: string;
  match_stage?: string;
}

interface RayOrderRow {
  order_number?: string | number;
  status?: number;
  win?: number;
  total_bonus?: number;
  create_time?: string;
  detail?: RayOrderDetail[];
}

function mapRayOrderRow(row: RayOrderRow): VenueOrder | null {
  const detail = row.detail?.[0];
  if (!detail) return null;

  let status: VenueOrderStatus = "none";
  let money = 0;
  const stake = Number(detail.stake) || 0;
  const totalBonus = Number(row.total_bonus) || 0;

  if (row.status === 0) {
    status = "none";
  } else if (row.status === 1) {
    money = totalBonus - stake;
    if (row.win === 1) status = "win";
    else if (row.win === 0) status = "lose";
  } else if (row.status === 4) {
    status = "reject";
  }

  const titleParts = String(detail.title ?? "").split("\n");
  let bet = titleParts.join(" ");
  let item = "";
  if (titleParts.length === 2) {
    bet = titleParts[0] ?? "";
    item = titleParts[1] ?? "";
  }

  return {
    provider: PLATFORMS.RAY,
    orderId: String(row.order_number ?? ""),
    odds: Number(detail.odds) || 0,
    createAt: parseVenueCreateAt(row.create_time),
    game: String(detail.game_id ?? ""),
    match: String(detail.match_name ?? ""),
    bet: `${detail.match_stage ?? ""} ${bet}`.trim(),
    item,
    betMoney: stake,
    reward: totalBonus,
    status,
    money,
  };
}

/** [A8 可证实] vYe：`${account.gateway}/v2/...` */
const RAY_A8_V2 = {
  user: "/v2/user",
  odds: (matchId: string) => `/v2/odds?match_id=${matchId}`,
  order: "/v2/order",
} as const;

export const rayProvider: PlatformProvider = {
  async getBalance(account) {
    const res = await accountGet<{ code?: number; result?: { balance?: number } }>(
      account,
      RAY_A8_V2.user,
    );
    if (!res || res.code !== 200) return undefined;
    return {
      balance: Number(res.result?.balance) || 0,
      currency: getCurrency(),
    };
  },

  async checkBet(account, option) {
    const res = await accountGet<{
      code?: number;
      result?: { odds?: RayOddsRow[]; start_time?: string };
    }>(account, RAY_A8_V2.odds(String(option.matchId)), { forceDirect: true });
    option.response = res;
    if (res.code !== 200) return option;

    const row = res.result?.odds?.find((d) => d.odds_id == option.itemId);
    option.response = row ?? res;
    if (!row || row.enable_parlay !== 1 || row.status !== 1) {
      option.checkError = `${row?.match_name} / [${row?.match_stage}] ${row?.group_name} / ${row?.name}@${row?.odds} 已封盘`;
      option.updateOdds(0);
      return option;
    }

    const betMin = row.bet_limit?.[0] ?? 0;
    const betMax = row.bet_limit?.[1] ?? 0;
    if (option.betMoney < betMin || option.betMoney > betMax) {
      option.checkError = useMessageStore().limitMessage(account, {
        match: option.match?.title,
        bet: option.bet?.getBetName(),
        odds: option.odds,
        betMoney: option.betMoney,
        limit: betMax,
      });
      return option;
    }

    const liveOdds = Number(row.odds);
    option.updateOdds(liveOdds);
    if (option.odds > liveOdds + 0.01) return option;
    option.odds = liveOdds;

    const title = `${row.group_name}\n${row.name}`;
    option.data = {
      total_stake: String(Math.round(option.betMoney)),
      total_bet_bonus: (Math.round(option.betMoney) * option.odds).toFixed(2),
      order: [
        {
          number: 1,
          oddsId: option.itemId,
          title,
          order_type: 0,
          stake: String(Math.round(option.betMoney)),
          order_detail: {
            odds_group_id: row.odds_group_id,
            value: row.value,
            win: row.win,
            status: 1,
            bet_limit: row.bet_limit,
            last_update: row.last_update,
            match_stage: row.match_stage,
            match_name: row.match_name,
            group_name: row.group_name,
            group_short_name: row.group_short_name,
            id: row.id,
            odds_id: row.odds_id,
            team_id: row.team_id,
            name: row.name,
            match_id: row.match_id,
            odds: option.odds,
            tag: row.tag,
            enable_parlay: row.enable_parlay,
            game_id: row.game_id,
            start_time: row.start_time,
            title,
            isLive: new Date(res.result!.start_time!).getTime() < Date.now(),
          },
          betMin: row.bet_limit?.[0],
          betMax: row.bet_limit?.[1],
        },
      ],
    };
    return option;
  },

  async getOrders(account) {
    const res = await accountGet<{ code?: number; result?: RayOrderRow[] }>(
      account,
      RAY_A8_V2.order,
      { forceDirect: true },
    );
    if (res.code !== 200 || !Array.isArray(res.result)) return [];
    const orders: VenueOrder[] = [];
    for (const row of res.result) {
      const mapped = mapRayOrderRow(row);
      if (mapped) orders.push(mapped);
    }
    return orders;
  },

  async betting(account, option) {
    const res = await accountPostForm<{ code?: number; desc?: string; result?: unknown }>(
      account,
      RAY_A8_V2.order,
      { order: JSON.stringify(option.data) },
    );
    let message: string | null = null;
    let newOdds = 0;
    switch (res.code) {
      case 501:
        newOdds =
          Number(
            res.result &&
              Array.isArray(res.result) &&
              res.result.length &&
              (res.result[0] as RayOddsRow).odds,
          ) || 0;
        message = `赔率下降至${newOdds || ""}`;
        break;
      case 200:
        message = `当前余额:${res.result}`;
        break;
      default:
        newOdds = 0;
        break;
    }
    option.updateOdds(newOdds);
    return new BetResult(
      account.provider,
      Boolean(res && res.code === 200),
      message || res.desc || "",
      option.data,
      res,
    );
  },
};
