import type { PlatformId } from "@/types/esport";
import manifest from "./manifest.json";

/** 单平台能力 — manifest.json 的类型化视图 */
export interface PlatformMeta {
  id: PlatformId;
  dir: string;
  sort: number;
  collect: boolean;
  bet: boolean;
  pluginOnly?: boolean;
  a8Channel?: boolean;
  collectionMode: string;
  saveMatchIntervalMs?: number;
}

const entries = manifest as PlatformMeta[];

export const PLATFORM_REGISTRY: PlatformMeta[] = entries.slice().sort((a, b) => a.sort - b.sort);

/** 所有平台 ID（UI、账号、采集默认开关） */
export const ALL_PLATFORMS: PlatformId[] = PLATFORM_REGISTRY.map((p) => p.id);

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
  Dex: "Dex",
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

export function platformDir(id: PlatformId): string | undefined {
  return metaById.get(id)?.dir;
}
