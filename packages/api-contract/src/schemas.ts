import { z } from "zod";

const PlatformId = z.enum(["OB", "RAY", "TF", "IA", "SABA", "PB", "IM", "IMT", "HG", "Stake", "XBet", "Dex", "Polymarket", "Limitless", "SXBet", "Azuro"]);

// ── Auth ──

export const LoginRequest = z.object({
  userName: z.string().min(1).or(z.string().min(1).describe("username")),
  password: z.string().min(1),
});

export const RefreshTokenRequest = z.object({
  refreshToken: z.string().min(1).optional(),
  refresh_token: z.string().min(1).optional(),
}).refine(d => d.refreshToken || d.refresh_token, { message: "缺少 refreshToken" });

// ── Collect (form-encoded, matchs/bets/timer are JSON strings) ──

export const SaveMatchRequest = z.object({
  provider: z.string().min(1),
  matchs: z.string().min(1),
});

export const SaveBetRequest = z.object({
  provider: z.string().min(1),
  matchId: z.union([z.string(), z.number()]),
  bets: z.string().min(1),
});

export const SaveLiveTimerRequest = z.object({
  provider: z.string().min(1),
  timer: z.string().min(1),
});

// ── Platform ──

export const GetCollectPlatformRequest = z.object({
  provider: z.string().min(1),
});

export const GetGamesRequest = z.object({
  provider: z.string().min(1),
});

export const UpdatePlatformRequest = z.object({
  provider: z.string().min(1),
  gateway: z.string().optional(),
  token: z.string().optional(),
  betName: z.string().optional(),
  games: z.string().optional(),
});

// ── User Config ──

export const UpdateSettingRequest = z.object({
  setting: z.unknown().optional(),
}).passthrough();

// ── Account ──

export const SaveAccountsRequest = z.object({
  Key: z.literal("ACCOUNT").optional(),
  Value: z.string().min(1),
});

// ── Order ──

export const GetOrderListRequest = z.object({
  pageIndex: z.coerce.number().int().min(0).default(0),
  pageSize: z.coerce.number().int().min(1).default(50),
  dateStart: z.coerce.number().optional(),
  dateEnd: z.coerce.number().optional(),
  provider: z.string().optional(),
  status: z.string().optional(),
});

export const SaveOrderRequest = z.object({
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
  PlayerID: z.coerce.number().optional(),
}).passthrough();
