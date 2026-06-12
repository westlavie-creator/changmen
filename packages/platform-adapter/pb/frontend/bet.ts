import { BetResult } from "@/models/betResult";
import { getPbLineId } from "./lineCache";
import { pbPost } from "./transport";
import { toNumber } from "./parse";
import { startPbRejectPoll, pbRejectStorageKey } from "./rejectPoll";
import type { PlatformProvider, VenueOrder, VenueOrderStatus } from "@platform/contract";
import { formatPbDateTime } from "@/shared/format";
import { PLATFORMS } from "@/shared/platform";

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

function wagerFilterBody(fields: Record<string, string | number | boolean>): string {
  return new URLSearchParams(
    Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, String(v)])),
  ).toString();
}

function mapWagerRow(u: unknown[], multiply: number): VenueOrder {
  const gameFull = String(u[28] ?? "");
  const game = gameFull.split(" - ")[0] ?? "";
  const match = String(u[9] ?? "");
  const mapNum = Number(u[42]) || 0;
  const bet = mapNum === 0 ? "全场" : `地图${mapNum}`;
  const item = String(u[22] ?? "");
  const orderId = String(u[7] ?? "");
  const odds = Number(u[16]) || 0;
  const reward = Number(u[29]) + Number(u[0] || 0);
  const betMoney = Number(u[29]) || 0;
  const createAt = Number(u[19]) || Date.now();
  const state = String(u[18] ?? "");

  let status: VenueOrderStatus = "none";
  let money = 0;
  if (state === "SETTLED") {
    status = reward > 0 ? "win" : "lose";
    money = reward - betMoney;
  } else if (state === "CANCELLED") {
    status = "return";
    money = 0;
  }

  return {
    provider: PLATFORMS.PB,
    orderId,
    odds,
    createAt,
    betMoney: betMoney * multiply,
    reward: reward * multiply,
    money: money * multiply,
    status,
    game,
    match,
    bet,
    item,
  };
}

export const pbProvider: PlatformProvider = {
  async getBalance(account) {
    if (!account.gateway || !account.token) {
      throw new Error("token error");
    }
    const path = `/member-service/v2/account-balance?locale=zh_CN&_=${Date.now()}&withCredentials=true`;
    const data = await pbPost<{
      success?: boolean;
      betCredit?: number;
      currency?: string;
      error?: string;
    }>(account, path, "");
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

  async getOrders(account) {
    const path = `/member-service/v2/wager-filter?locale=zh_CN`;
    const multiply = Math.max(1, account.multiply ?? 1);
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);

    const filters = [
      {
        f: formatPbDateTime(now),
        t: formatPbDateTime(now),
        d: -1,
        s: "OPEN",
        sd: false,
        type: "EVENT",
        product: "SB",
        timezone: "GMT-4",
        sportId: "",
        leagueId: "",
      },
      {
        f: formatPbDateTime(yesterday),
        t: formatPbDateTime(now),
        d: -1,
        s: "SETTLED",
        sd: false,
        type: "WAGER",
        product: "SB",
        timezone: "GMT-4",
        sportId: "",
        leagueId: "",
      },
    ];

    const rows: VenueOrder[] = [];
    for (const filter of filters) {
      const body = wagerFilterBody(filter);
      const data = await pbPost<unknown[] | { error?: string }>(account, path, body, {
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      });
      if (!data || (typeof data === "object" && !Array.isArray(data) && "error" in data)) continue;
      if (!Array.isArray(data)) continue;
      for (const raw of data) {
        if (!Array.isArray(raw)) continue;
        const order = mapWagerRow(raw, multiply);
        if (!rows.some((r) => r.orderId === order.orderId)) {
          rows.push(order);
        }
      }
    }

    const storageKey = pbRejectStorageKey(account);
    const cached = sessionStorage.getItem(storageKey);
    if (cached) {
      try {
        const pending = JSON.parse(cached) as VenueOrder;
        if (!rows.some((r) => r.orderId === pending.orderId)) {
          rows.push(pending);
        }
        if (pending.status !== "pending") {
          sessionStorage.removeItem(storageKey);
        }
      } catch {
        sessionStorage.removeItem(storageKey);
      }
    }

    return rows.sort((a, b) => b.createAt - a.createAt);
  },

  async checkBet(account, option) {
    const itemId = option.itemId;
    const cachedLine = getPbLineId(option.betId);
    if (!cachedLine) {
      option.checkError = `查找line值失败,${option.betId}`;
      return option;
    }

    const probePath = `/member-betslip/v2/all-odds-selections?locale=zh_CN&_=${Date.now()}&withCredentials=true`;
    const rows = await pbPost<PbOddsSelectionRow[]>(account, probePath, {
      oddsSelections: [
        {
          oddsFormat: 1,
          oddsId: itemId,
          oddsSelectionsType: "NORMAL",
          selectionId: `${cachedLine}|${itemId}`,
        },
      ],
    }, {
      "content-type": "application/json; charset=UTF-8",
    });

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

    let status: string | undefined;
    let body: PbBuyResponse | undefined;
    try {
      const path = `/bet-placement/buyV4?uniqueRequestId=${crypto.randomUUID()}&locale=zh_CN&_=${Date.now()}&withCredentials=true`;
      body = await pbPost<PbBuyResponse>(account, path, option.data, {
        "content-type": "application/json; charset=UTF-8",
      });
      status = body?.response?.[0]?.status;
      const errorCode = body?.response?.[0]?.errorCode;
      const ok = status === "ACCEPTED" || status === "PENDING_ACCEPTANCE";
      const message = errorCode ?? status ?? body?.errorMessage ?? "下单失败";
      return new BetResult(account.provider, ok, String(message), option.data, body);
    } finally {
      if (status === "PENDING_ACCEPTANCE") {
        void startPbRejectPoll(account, Date.now());
      }
    }
  },
};
