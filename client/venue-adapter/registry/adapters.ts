import type { PlatformAccount } from "@changmen/client-core/models/platformAccount";
import type { CollectorFactory, PlatformAdapter, PlatformProvider } from "@changmen/venue-adapter/contract";
import type { PlatformId } from "@changmen/api-contract";
import { withA8ResolveLegOutcome } from "@changmen/venue-adapter/adaptation/a8LegOutcome";
import { azuroAdapter } from "@changmen/venue-adapter/azuro";
import { predictFunAdapter } from "@changmen/venue-adapter/predictfun";
import { dexAdapter } from "@changmen/venue-adapter/dex";
import { hgAdapter } from "@changmen/venue-adapter/hg";
import { iaAdapter } from "@changmen/venue-adapter/ia";
import { imAdapter } from "@changmen/venue-adapter/im";
import { imtAdapter } from "@changmen/venue-adapter/imt";
import { limitlessAdapter } from "@changmen/venue-adapter/limitless";
import { obAdapter } from "@changmen/venue-adapter/ob";
import { pbAdapter } from "@changmen/venue-adapter/pb";
import { polymarketAdapter } from "@changmen/venue-adapter/polymarket";
import { rayAdapter } from "@changmen/venue-adapter/ray";
import { sabaAdapter } from "@changmen/venue-adapter/saba";
import { sxbetAdapter } from "@changmen/venue-adapter/sxbet";
import { stakeAdapter } from "@changmen/venue-adapter/stake";
import { tfAdapter } from "@changmen/venue-adapter/tf";
import { xbetAdapter } from "@changmen/venue-adapter/xbet";
import {
  betPlatformIds,
  collectPlatformIds,
  getPlatformMeta,
  platformSupportsBet,
} from "./meta";

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
  limitlessAdapter,
  sxbetAdapter,
  azuroAdapter,
  predictFunAdapter,
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
  const provider = adapterById.get(account.provider)?.provider;
  if (!provider)
    return undefined;
  return withA8ResolveLegOutcome(provider);
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
