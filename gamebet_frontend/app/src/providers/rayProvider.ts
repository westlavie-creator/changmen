import { BetResult } from "@/models/betResult";
import type { PlatformProvider } from "@/providers/types";
import { accountGet, accountPostForm } from "@/shared/platformHttp";
import { rayApiPath } from "@/collectors/ray/paths";

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

export const rayProvider: PlatformProvider = {
  async getBalance(account) {
    if (!account.gateway || !account.token) {
      throw new Error("token error");
    }
    const res = await accountGet<{ code?: number; result?: { balance?: number }; desc?: string }>(
      account,
      rayApiPath(account.gateway, "user"),
    );
    if (res.code !== 200) {
      throw new Error(res.desc || "v2/user failed");
    }
    return {
      balance: Number(res.result?.balance) || 0,
      currency: "CNY",
    };
  },

  async checkBet(account, option) {
    const res = await accountGet<{
      code?: number;
      result?: { odds?: RayOddsRow[]; start_time?: string };
    }>(account, `${rayApiPath(account.gateway, "odds")}?match_id=${option.matchId}`);
    option.response = res;
    if (res.code !== 200) {
      option.checkError = "获取赔率失败";
      return option;
    }

    const row = res.result?.odds?.find((d) => String(d.odds_id) === String(option.itemId));
    option.response = row ?? res;
    if (!row || row.enable_parlay !== 1 || row.status !== 1) {
      option.checkError = row
        ? `${row.match_name} / [${row.match_stage}] ${row.group_name} / ${row.name}@${row.odds} 已封盘`
        : "盘口不存在";
      option.updateOdds(0);
      return option;
    }

    if (option.betMoney < (row.bet_limit?.[0] ?? 0) || option.betMoney > (row.bet_limit?.[1] ?? 0)) {
      option.checkError = `限红 ${row.bet_limit?.[0]}-${row.bet_limit?.[1]}`;
      return option;
    }

    const liveOdds = Number(row.odds);
    option.updateOdds(liveOdds);
    if (option.odds > liveOdds + 0.01) return option;

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
            isLive: new Date(res.result?.start_time || 0).getTime() < Date.now(),
          },
          betMin: row.bet_limit?.[0],
          betMax: row.bet_limit?.[1],
        },
      ],
    };
    return option;
  },

  async betting(account, option) {
    const res = await accountPostForm<{ code?: number; desc?: string; result?: unknown }>(
      account,
      rayApiPath(account.gateway, "order"),
      { order: JSON.stringify(option.data) },
    );
    let message = res.desc || "";
    let newOdds = 0;
    if (res.code === 501) {
      const rows = res.result as RayOddsRow[] | undefined;
      newOdds = Number(rows?.[0]?.odds) || 0;
      message = `赔率下降至${newOdds || ""}`;
    } else if (res.code === 200) {
      message = `当前余额:${res.result}`;
    }
    option.updateOdds(newOdds);
    return new BetResult(
      account.provider,
      res.code === 200,
      message || (res.code === 200 ? "下单成功" : "下单失败"),
      option.data,
      res,
    );
  },
};
