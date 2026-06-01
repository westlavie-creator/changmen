import type { PlatformId } from "@/types/esport";

/** 单平台能力（采集 / 下注 / 插件）— 全 APP 平台清单的单一来源 */
export interface PlatformMeta {
  id: PlatformId;
  /** UI、账号排序、用户配置中的默认顺序 */
  sort: number;
  collect: boolean;
  bet: boolean;
  /** 下注仅能通过 A8 浏览器插件（如 Stake） */
  pluginOnly?: boolean;
  /** 采集走 A8 Socket 频道，非独立场馆 HTTP */
  a8Channel?: boolean;
}

export const PLATFORM_REGISTRY: PlatformMeta[] = [
  { id: "OB", sort: 0, collect: true, bet: true },
  { id: "IM", sort: 1, collect: true, bet: true },
  { id: "RAY", sort: 2, collect: true, bet: true },
  { id: "TF", sort: 3, collect: true, bet: true },
  { id: "IA", sort: 4, collect: true, bet: true },
  { id: "SABA", sort: 5, collect: true, bet: true },
  /** bundle 仅 Socket 采集/比分，无 `GetProvider(XBet)` 下注实现 */
  { id: "XBet", sort: 6, collect: true, bet: false, a8Channel: true },
  { id: "PB", sort: 7, collect: true, bet: true },
  { id: "IMT", sort: 8, collect: true, bet: true },
  { id: "HG", sort: 9, collect: true, bet: true },
  { id: "Stake", sort: 10, collect: true, bet: true, pluginOnly: true },
];

/** 所有平台 ID（UI、账号、采集默认开关） */
export const ALL_PLATFORMS: PlatformId[] = PLATFORM_REGISTRY.slice()
  .sort((a, b) => a.sort - b.sort)
  .map((p) => p.id);

/** 采集器内 `PLATFORMS.OB` 等常量 */
export const PLATFORMS = {
  OB: "OB",
  IM: "IM",
  RAY: "RAY",
  TF: "TF",
  IA: "IA",
  SABA: "SABA",
  XBet: "XBet",
  PB: "PB",
  IMT: "IMT",
  HG: "HG",
  Stake: "Stake",
} as const satisfies Record<string, PlatformId>;

const metaById = new Map(PLATFORM_REGISTRY.map((p) => [p.id, p]));

export function getPlatformMeta(id: PlatformId): PlatformMeta | undefined {
  return metaById.get(id);
}

export function platformSupportsCollect(id: PlatformId): boolean {
  return metaById.get(id)?.collect ?? false;
}

export function platformSupportsBet(id: PlatformId): boolean {
  return metaById.get(id)?.bet ?? false;
}

export function collectPlatformIds(): PlatformId[] {
  return PLATFORM_REGISTRY.filter((p) => p.collect).map((p) => p.id);
}

export function betPlatformIds(): PlatformId[] {
  return PLATFORM_REGISTRY.filter((p) => p.bet).map((p) => p.id);
}
