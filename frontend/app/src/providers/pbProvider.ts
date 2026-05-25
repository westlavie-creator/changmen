import { BetResult } from "@/models/betResult";
import type { PlatformAccount } from "@/models/platformAccount";
import type { PlatformProvider } from "@/providers/types";
import { accountRelayPostJson } from "@/utils/platformHttp";
import { buildPbAuthHeaders } from "@/utils/pbHeaders";
import { getPbLineId } from "@/utils/pbLineCache";
import { toNumber } from "@/utils/pbCore";

interface PbOddsSelectionRow {
  status?: string;
  minStake?: number;
  maxStake?: number;
  odds?: number | { toNumber?: () => number };
  lineId?: number;
}

interface PbBuyResponse {
  response?: Array<{ status?: string; uniqueRequestId?: string; errorCode?: string }>;
  errorMessage?: string;
}

function pbUrl(account: PlatformAccount, path: string): string {
  const base = (account.gateway || "").replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export const pbProvider: PlatformProvider = {
  async getBalance(account) {
    if (!account.gateway || !account.token) {
      throw new Error("token error");
    }
    const headers = buildPbAuthHeaders(account);
    if (!headers) throw new Error("token error");

    const path = `/member-service/v2/account-balance?locale=zh_CN&_=${Date.now()}&withCredentials=true`;
    const res = await accountRelayPostJson<{
      success?: boolean;
      betCredit?: number;
      currency?: string;
      error?: string;
    }>(account, pbUrl(account, path), "", headers);
    const data = res.data;
    if (data.error) {
      throw new Error(data.error === "MULTIPLE_LOGIN" ? "token error" : String(data.error));
    }
    if (!data.success) {
      throw new Error("token error");
    }
    const multiply = Math.max(1, account.multiply ?? 1);
    return {
      balance: Number(data.betCredit) * multiply || 0,
      currency: data.currency || "CNY",
    };
  },

  async checkBet(account, option) {
    const headers = buildPbAuthHeaders(account, {
      "content-type": "application/json; charset=UTF-8",
    });
    if (!headers) {
      option.checkError = "token error";
      return option;
    }

    const itemId = option.itemId;
    const cachedLine = getPbLineId(option.betId);
    if (!cachedLine) {
      option.checkError = `查找line值失败,${option.betId}`;
      return option;
    }

    const probePath = `/member-betslip/v2/all-odds-selections?locale=zh_CN&_=${Date.now()}&withCredentials=true`;
    const probe = await accountRelayPostJson<PbOddsSelectionRow[]>(
      account,
      pbUrl(account, probePath),
      {
        oddsSelections: [
          {
            oddsFormat: 1,
            oddsId: itemId,
            oddsSelectionsType: "NORMAL",
            selectionId: `${cachedLine}|${itemId}`,
          },
        ],
      },
      headers,
    );

    const rows = probe.data;
    option.response = rows;
    if (!Array.isArray(rows) || rows.length !== 1) {
      option.checkError = JSON.stringify(rows);
      return option;
    }

    const row = rows[0]!;
    if (row.status === "UNAVAILABLE") {
      option.checkError = row.status;
      return option;
    }

    const multiply = Math.max(1, account.multiply ?? 1);
    const stake = Math.max(7, Math.floor(option.betMoney / multiply));
    const minStake = Number(row.minStake) || 0;
    const maxStake = Number(row.maxStake) || 0;
    if (stake < minStake || stake > maxStake) {
      option.checkError = `限红 ${minStake}-${maxStake}`;
      return option;
    }

    const liveOdds = toNumber(row.odds);
    option.newOdds = liveOdds;
    if (liveOdds < option.odds - 0.01) {
      option.checkError = `赔率下降至 ${liveOdds}`;
      option.updateOdds(liveOdds);
      return option;
    }
    option.updateOdds(liveOdds);

    const parts = itemId.split("|");
    parts[5] = "0.00";
    parts[6] = option.target === "Home" ? "0" : "1";
    const lineId = row.lineId ?? cachedLine;
    const uniqueRequestId = crypto.randomUUID();

    option.data = {
      acceptBetterOdds: false,
      oddsFormat: 1,
      selections: [
        {
          odds: liveOdds,
          oddsId: itemId,
          selectionId: `${lineId}|0|${parts.join("|")}`,
          stake,
          winRiskStake: "RISK",
          wagerType: "NORMAL",
          uniqueRequestId,
          betLocationTracking: {
            mainPages: "ESPORT",
            marketTab: "UNKNOWN",
            market: "UNKNOWN",
            view: "NEW_EUROPE_VIEW",
            navigation: "SPORTS",
            oddsContainerCategory: "MAIN",
            oddsContainerTitle: "UNKNOWN",
            marketType: "UNKNOWN",
            eventSorting: "UNKNOWN",
            pageType: "UNKNOWN",
            defaultPage: "UNKNOWN",
            reuseSelection: false,
            isLiveStreamPlaying: null,
            device: "DESKTOP",
            displayMode: "LIGHT",
            language: "zh_CN",
            timeZone: null,
          },
        },
      ],
      clientVersion: "master_9036928d",
    };
    return option;
  },

  async betting(account, option) {
    const selection = (option.data?.selections as Array<{ uniqueRequestId?: string }> | undefined)?.[0];
    if (!selection?.uniqueRequestId) {
      return new BetResult(account.provider, false, "requestId error", option.data);
    }

    const headers = buildPbAuthHeaders(account, {
      "content-type": "application/json; charset=UTF-8",
    });
    if (!headers) {
      return new BetResult(account.provider, false, "token error", option.data);
    }

    const path = `/bet-placement/buyV4?uniqueRequestId=${crypto.randomUUID()}&locale=zh_CN&_=${Date.now()}&withCredentials=true`;
    const res = await accountRelayPostJson<PbBuyResponse>(
      account,
      pbUrl(account, path),
      option.data,
      headers,
    );
    const body = res.data;
    const status = body?.response?.[0]?.status;
    const errorCode = body?.response?.[0]?.errorCode;
    const ok = status === "ACCEPTED" || status === "PENDING_ACCEPTANCE";
    const message = errorCode ?? status ?? body?.errorMessage ?? "下单失败";
    return new BetResult(account.provider, ok, String(message), option.data, body);
  },
};
