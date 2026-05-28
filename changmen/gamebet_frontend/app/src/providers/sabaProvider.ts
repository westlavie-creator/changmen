import { BetResult } from "@/models/betResult";
import type { PlatformAccount } from "@/models/platformAccount";
import type { PlatformProvider } from "@/providers/types";
import { toBracketForm } from "@/shared/bracketForm";
import { accountRelayPost } from "@/shared/platformHttp";
import { parseSabaItemId, sabaAccountUrl, sabaFormHeaders } from "@/collectors/saba/paths";

interface SabaBalanceResponse {
  Data?: { Curr?: string; BCredit?: number | { toNumber?: () => number } };
}

interface SabaTicketCommon {
  ErrorCode?: number;
  ErrorMsg?: string;
}

interface SabaTicketRow {
  Common?: SabaTicketCommon;
  OddsStatus?: string;
  Message?: string;
  Minbet?: number | { toNumber?: () => number };
  Maxbet?: number | { toNumber?: () => number };
  DisplayOdds?: number | string;
  ChoiceValue?: string;
  HomeName?: string;
  AwayName?: string;
  IsInPlay?: boolean;
  sinfo?: unknown;
  Guid?: string;
  TicketTime?: string;
}

interface SabaGetTicketsResponse {
  ErrorCode?: number;
  Data?: SabaTicketRow[];
}

interface SabaProcessBetResponse {
  ErrorCode?: number;
  Data?: { ItemList?: Array<{ ErrorCode?: number; Message?: string }> };
}

function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "object" && v !== null && typeof (v as { toNumber?: () => number }).toNumber === "function") {
    return (v as { toNumber: () => number }).toNumber();
  }
  return Number(v) || 0;
}

const oddsTypeInitByToken = new Set<string>();

async function ensureSabaSession(account: PlatformAccount): Promise<void> {
  const token = account.token || "";
  if (!token || !account.gateway) return;

  if (!oddsTypeInitByToken.has(token)) {
    try {
      await accountRelayPost(
        account,
        sabaAccountUrl(account, "/Customer/OddsType?set=1"),
        "",
        sabaFormHeaders(),
      );
      oddsTypeInitByToken.add(token);
    } catch (err) {
      console.warn("[SABA] OddsType init failed", err);
    }
  }

  try {
    await accountRelayPost(account, sabaAccountUrl(account, "/LoginCheckin/Index"), "", {
      ...sabaFormHeaders(),
      username: "",
    });
  } catch (err) {
    console.warn("[SABA] LoginCheckin failed", err);
  }
}

function buildTicketItem(
  option: { matchId: string; odds: number; betMoney: number },
  parsed: { oddsId: number; side: "h" | "a" },
  ticket?: SabaTicketRow,
) {
  return {
    Type: "OU",
    Bettype: 9001,
    Oddsid: parsed.oddsId,
    Odds: option.odds,
    Line: 0,
    Hdp1: 0,
    Hdp2: 0,
    Hscore: 0,
    Ascore: 0,
    Betteam: parsed.side,
    Stake: ticket ? Math.round(option.betMoney) : "",
    Matchid: option.matchId,
    ChoiceValue: ticket?.ChoiceValue ?? "",
    SrcOddsInfo: "",
    Home: ticket?.HomeName ?? "",
    Away: ticket?.AwayName ?? "",
    Gameid: 43,
    ProgramID: ticket ? 0 : "",
    RaceNum: 0,
    Runner: 0,
    AcceptBetterOdds: true,
    isQuickBet: false,
    isTablet: false,
    PhoneBettingSetting: {
      IsGraphButton: false,
      GraphRemark: "",
      AdminID: 0,
      HideTicket: false,
      Using1X2AsiaHdp: false,
      Using1X2Hdp: false,
      IsKeyInDeadBallLiveScore: true,
    },
    IsInPlay: ticket?.IsInPlay ?? false,
    BonusID: 0,
    BonusType: 0,
    MMR: "",
    parentMatchId: 0,
    ...(ticket
      ? {
          MRPercentage: "",
          sinfo: ticket.sinfo,
          RecommendType: 0,
          Guid: ticket.Guid,
          TicketTime: ticket.TicketTime,
          ErrorCode: 0,
        }
      : {}),
  };
}

export const sabaProvider: PlatformProvider = {
  async getBalance(account) {
    if (!account.gateway || !account.token) throw new Error("token error");
    try {
      const url = sabaAccountUrl(account, "/Customer/Balance");
      const res = await accountRelayPost<SabaBalanceResponse>(
        account,
        url,
        toBracketForm({ TimeZone: 8 }),
        sabaFormHeaders(),
      );
      const data = res.data?.Data;
      if (!data) throw new Error("balance failed");
      return {
        currency: data.Curr || "CNY",
        balance: toNum(data.BCredit),
      };
    } finally {
      await ensureSabaSession(account);
    }
  },

  async checkBet(account, option) {
    await ensureSabaSession(account);
    const parsed = parseSabaItemId(option.itemId);
    if (!parsed) {
      option.checkError = `无效 itemId: ${option.itemId}`;
      return option;
    }

    const url = sabaAccountUrl(account, "/Betting/GetTickets");
    const body = toBracketForm({
      ItemList: [buildTicketItem(option, parsed)],
    });

    let res: { status: number; data: SabaGetTicketsResponse };
    try {
      res = await accountRelayPost<SabaGetTicketsResponse>(account, url, body, sabaFormHeaders());
    } catch (err) {
      option.response = err;
      option.checkError = err instanceof Error ? err.message : String(err);
      return option;
    }

    const data = res.data;
    option.response = data;
    if (data.ErrorCode !== 0 || data.Data?.length !== 1) {
      option.checkError = "预检失败";
      return option;
    }

    const ticket = data.Data[0]!;
    const common = ticket.Common;
    if (
      (common && [46, 47].includes(common.ErrorCode ?? 0) &&
        ["ClosePrice", "MarketClosed"].includes(common.ErrorMsg ?? "")) ||
      ticket.OddsStatus !== "running"
    ) {
      option.checkError = ticket.Message || common?.ErrorMsg || "盘口已关闭";
      option.updateOdds(0);
      return option;
    }

    const minBet = toNum(ticket.Minbet);
    const maxBet = toNum(ticket.Maxbet);
    if (option.betMoney < minBet || option.betMoney > maxBet) {
      option.checkError = `限红 ${minBet}-${maxBet}`;
      return option;
    }

    const liveOdds = Number(ticket.DisplayOdds) || 0;
    if (option.odds < liveOdds || Math.abs(option.odds - liveOdds) <= 0.01) {
      option.odds = liveOdds;
      option.updateOdds(liveOdds);
    } else {
      option.checkError = ticket.Message || `赔率下降至 ${liveOdds}`;
      option.updateOdds(liveOdds);
      return option;
    }

    option.data = {
      ItemList: [buildTicketItem(option, parsed, ticket)],
    };
    return option;
  },

  async betting(account, option) {
    const url = sabaAccountUrl(account, "/Betting/ProcessBet");
    const res = await accountRelayPost<SabaProcessBetResponse>(
      account,
      url,
      toBracketForm(option.data ?? {}),
      sabaFormHeaders(),
    );
    const body = res.data;
    const item = body?.Data?.ItemList?.[0];
    const ok = body?.ErrorCode === 0 && item?.ErrorCode === 0;
    const message = item?.Message || (ok ? "下单成功" : "下单失败");
    if (!ok) option.updateOdds(0);
    return new BetResult(account.provider, ok, message, option.data, body);
  },
};
