import type { PlatformAccount } from "@/models/platformAccount";
import type { CollectorFactory, PlatformAdapter, PlatformProvider } from "@platform/contract";
import type { PlatformId } from "@/types/esport";
import { dexAdapter } from "@platform/dex";
import { hgAdapter } from "@platform/hg";
import { iaAdapter } from "@platform/ia";
import { imAdapter } from "@platform/im";
import { imtAdapter } from "@platform/imt";
import { obAdapter } from "@platform/ob";
import { pbAdapter } from "@platform/pb";
import { polymarketAdapter } from "@platform/polymarket";
import { rayAdapter } from "@platform/ray";
import { sabaAdapter } from "@platform/saba";
import { stakeAdapter } from "@platform/stake";
import { tfAdapter } from "@platform/tf";
import { xbetAdapter } from "@platform/xbet";
import {
  betPlatformIds,
  collectPlatformIds,
  getPlatformMeta,
  platformSupportsBet,
} from "@platform/registry";

/** 全平台适配器 — 对齐 A8 `bf.GetProvider` 注册表 */
export const PLATFORM_ADAPTERS: PlatformAdapter[] = [
  obAdapter,
  imAdapter,
  rayAdapter,
  tfAdapter,
  iaAdapter,
  sabaAdapter,
  xbetAdapter,
  pbAdapter,
  imtAdapter,
  hgAdapter,
  stakeAdapter,
  dexAdapter,
  polymarketAdapter,
];

const adapterById = new Map<PlatformId, PlatformAdapter>(
  PLATFORM_ADAPTERS.map(a => [a.id, a]),
);

export function getAdapter(id: PlatformId): PlatformAdapter | undefined {
  return adapterById.get(id);
}

/** 对齐 A8 `bf.GetProvider(account)`：只返回支持下注的 provider。 */
export function getProvider(account: PlatformAccount): PlatformProvider | undefined {
  if (!account.provider || !platformSupportsBet(account.provider))
    return undefined;
  return adapterById.get(account.provider)?.provider;
}

export function getCollectorFactory(id: PlatformId): CollectorFactory | undefined {
  return adapterById.get(id)?.collector;
}

export function buildCollectorFactories(): Partial<Record<PlatformId, CollectorFactory>> {
  const map: Partial<Record<PlatformId, CollectorFactory>> = {};
  for (const id of collectPlatformIds()) {
    const factory = getCollectorFactory(id);
    if (factory)
      map[id] = factory;
  }
  return map;
}

export function supportedBetProviders(): PlatformId[] {
  return betPlatformIds();
}

if (import.meta.env.DEV) {
  const expectedCollect = new Set(collectPlatformIds());
  for (const adapter of PLATFORM_ADAPTERS) {
    if (adapter.collector && !expectedCollect.has(adapter.id)) {
      console.warn(`[platform_adapter] 未在 manifest 声明采集: ${adapter.id}`);
    }
  }
  for (const id of collectPlatformIds()) {
    if (!getCollectorFactory(id)) {
      console.warn(`[platform_adapter] manifest 声明采集但未注册 collector: ${id}`);
    }
  }
  for (const adapter of PLATFORM_ADAPTERS) {
    if (platformSupportsBet(adapter.id) && !adapter.provider) {
      console.warn(`[platform_adapter] manifest bet:true 但缺少 provider: ${adapter.id}`);
    }
  }
  for (const adapter of PLATFORM_ADAPTERS) {
    const meta = getPlatformMeta(adapter.id);
    if (!meta) {
      console.warn(`[platform_adapter] adapter 未在 manifest 中: ${adapter.id}`);
    }
  }
}
