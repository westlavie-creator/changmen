import { z } from "zod";
const PlatformId = z.enum(["OB", "RAY", "TF", "IA", "SABA", "PB", "IM", "IMT", "HG", "Stake", "XBet", "Dex", "Polymarket", "Limitless", "SXBet", "Azuro", "PredictFun"]);
const LoginRequest = z.object({
  userName: z.string().min(1).or(z.string().min(1).describe("username")),
  password: z.string().min(1)
});
const RefreshTokenRequest = z.object({
  refreshToken: z.string().min(1).optional(),
  refresh_token: z.string().min(1).optional()
}).refine((d) => d.refreshToken || d.refresh_token, { message: "\u7F3A\u5C11 refreshToken" });
const SaveMatchRequest = z.object({
  provider: z.string().min(1),
  matchs: z.string().min(1)
});
const SaveBetRequest = z.object({
  provider: z.string().min(1),
  matchId: z.union([z.string(), z.number()]),
  bets: z.string().min(1)
});
const SaveLiveTimerRequest = z.object({
  provider: z.string().min(1),
  timer: z.string().min(1)
});
const GetCollectPlatformRequest = z.object({
  provider: z.string().min(1)
});
const GetGamesRequest = z.object({
  provider: z.string().min(1)
});
const UpdatePlatformRequest = z.object({
  provider: z.string().min(1),
  gateway: z.string().optional(),
  token: z.string().optional(),
  betName: z.string().optional(),
  games: z.string().optional()
});
const UpdateSettingRequest = z.object({
  setting: z.unknown().optional()
}).passthrough();
const SaveAccountsRequest = z.object({
  Key: z.literal("ACCOUNT").optional(),
  Value: z.string().min(1)
});
const GetOrderListRequest = z.object({
  pageIndex: z.coerce.number().int().min(0).default(0),
  pageSize: z.coerce.number().int().min(1).default(50),
  dateStart: z.coerce.number().optional(),
  dateEnd: z.coerce.number().optional(),
  provider: z.string().optional(),
  status: z.string().optional()
});
const SaveOrderRequest = z.object({
  Link: z.coerce.number().optional(),
  Type: PlatformId.optional(),
  Match: z.string().optional(),
  Bet: z.string().optional(),
  Item: z.string().optional(),
  Odds: z.coerce.number().optional(),
  BetMoney: z.coerce.number().optional(),
  Money: z.coerce.number().optional(),
  Status: z.string().optional(),
  CreateAt: z.coerce.number().optional(),
  PlayerID: z.coerce.number().optional()
}).passthrough();
const GetMatchsBetSourceOutbound = z.object({
  Type: z.string().optional(),
  BetID: z.union([z.string(), z.number()]).optional(),
  HomeID: z.union([z.string(), z.number()]).optional(),
  AwayID: z.union([z.string(), z.number()]).optional(),
  HomeOdds: z.number().optional(),
  AwayOdds: z.number().optional(),
  Status: z.string().optional(),
  HomeMarketID: z.string().optional(),
  AwayMarketID: z.string().optional()
}).passthrough();
const GetMatchsBetRowOutbound = z.object({
  Map: z.union([z.string(), z.number()]).optional(),
  Sources: z.record(z.string(), z.unknown()).optional()
}).passthrough();
const GetMatchsMatchOutbound = z.object({
  ID: z.union([z.string(), z.number()]).optional(),
  Bets: z.array(z.unknown()).optional()
}).passthrough();
const GetMatchsListOutbound = z.array(GetMatchsMatchOutbound);
function isPredictFunSourceKey(key, src) {
  if (key === "PredictFun" || key === "PF")
    return true;
  const t = String(src.Type ?? "").trim();
  return t === "PredictFun" || t === "PF";
}
function missingPfMarketIds(src) {
  const miss = [];
  if (!String(src.HomeMarketID ?? "").trim())
    miss.push("HomeMarketID");
  if (!String(src.AwayMarketID ?? "").trim())
    miss.push("AwayMarketID");
  return miss;
}
const _getMatchsWarn = {
  checks: 0,
  issueEvents: 0,
  lastIssueCount: 0,
  lastIssues: [],
  lastAt: 0
};
function getGetMatchsOutboundWarnStats() {
  return { ..._getMatchsWarn, lastIssues: [..._getMatchsWarn.lastIssues] };
}
function __resetGetMatchsOutboundWarnStatsForTests() {
  _getMatchsWarn.checks = 0;
  _getMatchsWarn.issueEvents = 0;
  _getMatchsWarn.lastIssueCount = 0;
  _getMatchsWarn.lastIssues = [];
  _getMatchsWarn.lastAt = 0;
}
function warnClientGetMatchsOutbound(list, opts = {}) {
  const maxIssues = opts.maxIssues ?? 30;
  const issues = [];
  let pfSourceCount = 0;
  _getMatchsWarn.checks += 1;
  const parsed = GetMatchsListOutbound.safeParse(list);
  if (!parsed.success) {
    issues.push(`list_shape: ${parsed.error.issues[0]?.message || "invalid"}`);
  } else {
    for (const match of parsed.data) {
      if (issues.length >= maxIssues)
        break;
      const matchId = match.ID ?? "?";
      const bets = Array.isArray(match.Bets) ? match.Bets : [];
      for (let bi = 0; bi < bets.length; bi++) {
        if (issues.length >= maxIssues)
          break;
        const bet = bets[bi];
        if (!bet || typeof bet !== "object")
          continue;
        const sources = bet.Sources;
        if (!sources || typeof sources !== "object" || Array.isArray(sources))
          continue;
        for (const [key, raw] of Object.entries(sources)) {
          if (issues.length >= maxIssues)
            break;
          if (!raw || typeof raw !== "object" || Array.isArray(raw))
            continue;
          const src = raw;
          if (!isPredictFunSourceKey(key, src))
            continue;
          pfSourceCount += 1;
          const miss = missingPfMarketIds(src);
          if (miss.length) {
            issues.push(
              `match=${matchId} bet[${bi}] source=${key} missing ${miss.join(",")}`
            );
          }
        }
      }
    }
  }
  if (issues.length) {
    _getMatchsWarn.issueEvents += 1;
    _getMatchsWarn.lastIssueCount = issues.length;
    _getMatchsWarn.lastIssues = issues.slice(0, 20);
    _getMatchsWarn.lastAt = Date.now();
  } else {
    _getMatchsWarn.lastIssueCount = 0;
  }
  return { ok: issues.length === 0, issues, pfSourceCount };
}
export {
  GetCollectPlatformRequest,
  GetGamesRequest,
  GetMatchsBetRowOutbound,
  GetMatchsBetSourceOutbound,
  GetMatchsListOutbound,
  GetMatchsMatchOutbound,
  GetOrderListRequest,
  LoginRequest,
  RefreshTokenRequest,
  SaveAccountsRequest,
  SaveBetRequest,
  SaveLiveTimerRequest,
  SaveMatchRequest,
  SaveOrderRequest,
  UpdatePlatformRequest,
  UpdateSettingRequest,
  __resetGetMatchsOutboundWarnStatsForTests,
  getGetMatchsOutboundWarnStats,
  warnClientGetMatchsOutbound
};
