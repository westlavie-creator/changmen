import type { PlatformAccount } from "@/models/platformAccount";
import { BetResult } from "@/models/betResult";
import type { PlatformProvider } from "@/providers/types";
import { buildImAccountHeaders, imAccountUrl } from "@/utils/imHeaders";
import { IM_SPORT_BY_GAME_ID, signImPayload } from "@/utils/imSign";
import { accountRelayPostJson } from "@/utils/platformHttp";

interface ImBalanceResponse {
  StatusCode?: number;
  StatusDesc?: string;
  MemberBalances?: Array<{ Currency?: string; AvailableBalance?: number | string }>;
}

interface ImBetInfoResponse {
  StatusCode?: number;
  StatusDesc?: string;
  Hash?: string;
  ServerTicks?: number;
  BetInfos?: Array<{
    StatusCode?: number;
    StatusDesc?: string;
    MinStake?: number;
    MaxStake?: number;
    Odds?: number;
  }>;
}

interface ImPlaceBetResponse {
  StatusCode?: number;
  StatusDesc?: string;
  Odds?: number | string;
}

async function extendImSession(account: PlatformAccount): Promise<void> {
  const path = "/api/ExtendSession";
  const payload = await signImPayload(
    {
      BettingChannel: 1,
      Token: account.token,
      TriggeredBy: 2,
    },
    path,
  );
  const url = imAccountUrl(account, path);
  await accountRelayPostJson(account, url, payload, buildImAccountHeaders(account));
}

export const imProvider: PlatformProvider = {
  async getBalance(account) {
    if (!account.token) throw new Error("token error");
    const path = "/api/GetMemberBalance";
    const payload = await signImPayload(
      {
        BettingChannel: 1,
        Token: account.token,
        TriggeredBy: 1,
        Type: 1,
      },
      path,
    );
    const res = await accountRelayPostJson<ImBalanceResponse>(
      account,
      imAccountUrl(account, path),
      payload,
      buildImAccountHeaders(account),
    );
    const body = res.data;
    if (body.StatusCode !== 0) throw new Error(body.StatusDesc || "balance failed");
    await extendImSession(account);
    const row = body.MemberBalances?.[0];
    return {
      currency: row?.Currency || "CNY",
      balance: Number(row?.AvailableBalance) || 0,
    };
  },

  async checkBet(account, option) {
    const gameId = option.match?.gameId ?? 0;
    const sportId = IM_SPORT_BY_GAME_ID.get(Number(gameId));
    if (!sportId) {
      option.checkError = `未找到游戏ID:${gameId}对应的参数`;
      return option;
    }

    const path = "/api/GetBetInfoSingleV2";
    const sCode = Number(option.itemId.split(":")[1]);
    const payload = await signImPayload(
      {
        GameCat: 1,
        OddsType: 3,
        Currency: "RMB",
        Token: account.token,
        BettingChannel: 2,
        BetInfos: [
          {
            SportId: sportId,
            MatchNo: option.betId,
            HDP: 0,
            SCode: sCode,
            STId: 1,
            ComboId: 0,
            ComboSelection: null,
          },
        ],
        Language: "chs",
        TriggeredBy: 1,
      },
      path,
    );
    option.request = payload;

    const res = await accountRelayPostJson<ImBetInfoResponse>(
      account,
      imAccountUrl(account, path),
      payload,
      buildImAccountHeaders(account),
    );
    const body = res.data;
    option.response = body;

    if (body.StatusCode !== 0) {
      option.checkError = body.StatusDesc || "预检失败";
      return option;
    }

    const info = body.BetInfos?.[0];
    if (!info) {
      option.checkError = "数据结构错误";
      return option;
    }
    if (info.StatusCode !== 0) {
      option.checkError = info.StatusDesc || "盘口不可用";
      return option;
    }
    if (option.betMoney < (info.MinStake ?? 0) || option.betMoney > (info.MaxStake ?? 0)) {
      option.checkError = `限红 ${info.MinStake}-${info.MaxStake}`;
      return option;
    }

    const liveOdds = Number(info.Odds) || 0;
    if (option.odds < liveOdds || Math.abs(option.odds - liveOdds) <= 0.01) {
      option.newOdds = Math.min(option.odds, liveOdds);
      option.odds = option.newOdds;
      option.updateOdds(option.newOdds);
    } else {
      option.checkError = `赔率下降至 ${liveOdds}`;
      option.updateOdds(liveOdds);
      return option;
    }

    option.data = await signImPayload(
      {
        GameCat: 1,
        CustomerIP: "",
        BettingChannel: 2,
        OddsType: 3,
        Stake: option.betMoney.toString(),
        IsParlay: false,
        Hash: body.Hash,
        ServerTicks: body.ServerTicks,
        BetLists: [
          {
            MatchNo: option.betId,
            SCode: sCode,
            Odds: option.odds,
            HDP: 0,
            STId: 2,
            ComboId: 0,
            ComboSelection: null,
          },
        ],
        Token: account.token,
        Currency: "RMB",
        IsLiveStreamOn: false,
        TriggeredBy: 1,
      },
      "/api/PlaceBetV2",
    );
    return option;
  },

  async betting(account, option) {
    const path = "/api/PlaceBetV2";
    let res: { status: number; data: ImPlaceBetResponse };
    try {
      res = await accountRelayPostJson<ImPlaceBetResponse>(
        account,
        imAccountUrl(account, path),
        option.data,
        buildImAccountHeaders(account),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return new BetResult(account.provider, false, message, option.data, err);
    }

    const body = res.data;
    const ok = body?.StatusCode === 0;
    if (!ok) option.updateOdds(0);
    const message = ok
      ? `实际赔率:${body.Odds ?? option.odds}`
      : body?.StatusDesc || "下单失败";
    return new BetResult(account.provider, ok, message, option.data, body);
  },
};
