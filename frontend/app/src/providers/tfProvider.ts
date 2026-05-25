import type { BetOption } from "@/models/betOption";
import { BetResult } from "@/models/betResult";
import type { PlatformProvider } from "@/providers/types";
import { accountTfGet, accountTfPost } from "@/utils/platformHttp";
import { parseTfItemId, tfOddsPayload } from "@/utils/tfPaths";

interface TfProbeResponse {
  code?: number;
  msg?: string;
  value?: string;
  member_odds?: string | number;
  member_odds_style?: string;
}

function parseEuroFromProbeValue(value: unknown): number {
  const text = String(value ?? "");
  const m = /^([0-9.]+)/.exec(text);
  return m ? Number(m[1]) : 0;
}

function buildTicket(option: BetOption, euroOdds: number) {
  const { selection } = parseTfItemId(option.itemId);
  const { odds, memberOdds } = tfOddsPayload(euroOdds);
  return {
    amount: option.betMoney.toFixed(2),
    accept_any_odds: false,
    tickets: [
      {
        market_id: option.betId,
        bet_type_selection: selection,
        odds,
        member: {
          odds: memberOdds,
          odds_type: "euro",
        },
      },
    ],
  };
}

export const tfProvider: PlatformProvider = {
  async getBalance(account) {
    const res = await accountTfGet<{ currency?: string; balance?: number }>(
      account,
      "/api/game-client/v8/wallet/",
    );
    const data = res.data;
    if (!data?.currency) throw new Error("token error");
    return {
      currency: data.currency,
      balance: Number(data.balance) || 0,
    };
  },

  async checkBet(account, option) {
    const { selection } = parseTfItemId(option.itemId);
    let liveOdds = option.odds;

    if (!option.loseOrder) {
      let probe: { status: number; data: TfProbeResponse };
      try {
        probe = await accountTfPost<TfProbeResponse>(account, "/api/game-client/v8/single-bet/", {
          amount: "11.00",
          accept_any_odds: false,
          tickets: [
            {
              market_id: option.betId,
              bet_type_selection: selection,
              odds: "-0.05",
              member: { odds: "21", odds_type: "euro" },
            },
          ],
        });
      } catch (err) {
        option.response = err;
        option.checkError = err instanceof Error ? err.message : String(err);
        option.updateOdds(0);
        return option;
      }

      const body = probe.data;
      option.response = body;
      const oddsPattern = /^([0-9.]+)/;

      if (body.code === 4 && oddsPattern.test(String(body.value ?? ""))) {
        liveOdds = parseEuroFromProbeValue(body.value);
        option.updateOdds(liveOdds);
        if (option.odds > liveOdds + 0.01) {
          option.checkError = `${body.msg ?? "赔率变化"} ${body.value ?? ""}`;
          return option;
        }
        option.odds = liveOdds;
      } else {
        option.checkError = body.msg || "预检失败";
        option.updateOdds(0);
        return option;
      }
    }

    option.data = buildTicket(option, option.odds);
    return option;
  },

  async betting(account, option) {
    let res: { status: number; data: TfProbeResponse };
    try {
      res = await accountTfPost<TfProbeResponse>(
        account,
        "/api/game-client/v8/single-bet/",
        option.data,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return new BetResult(account.provider, false, message, option.data, err);
    }

    const body = res.data;
    let newOdds = 0;
    if (body.code === 16 && body.value) {
      newOdds = Number(body.value) || 0;
    } else if (body.member_odds_style === "euro" && body.member_odds) {
      newOdds = Number(body.member_odds) || 0;
    } else if (body.code === 4 && body.value) {
      newOdds = parseEuroFromProbeValue(body.value);
    }

    if (newOdds) option.updateOdds(Number(newOdds.toFixed(2)));
    const ok = res.status === 201;
    const message = ok
      ? `实际赔率:${body.member_odds ?? newOdds}`
      : `${body.msg ?? "下单失败"} ${body.value ?? ""}`.trim();
    return new BetResult(account.provider, ok, message, option.data, body);
  },
};
