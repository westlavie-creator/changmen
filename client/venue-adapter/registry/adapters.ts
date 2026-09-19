import type { PlatformId } from "@changmen/api-contract";
import type { PlatformAccount } from "@changmen/client-core/models/platformAccount";
import type { CollectorFactory, PlatformAdapter, PlatformProvider } from "../contract";
import { withA8ResolveLegOutcome } from "../adaptation/a8LegOutcome";
import { azuroAdapter } from "../azuro";
import { dexAdapter } from "../dex";
import { hgAdapter } from "../hg";
import { iaAdapter } from "../ia";
import { imAdapter } from "../im";
import { imtAdapter } from "../imt";
import { limitlessAdapter } from "../limitless";
import { obAdapter } from "../ob";
import { pbAdapter } from "../pb";
import { polymarketAdapter } from "../polymarket";
import { predictFunAdapter } from "../predictfun";
import { rayAdapter } from "../ray";
import { sabaAdapter } from "../saba";
import { stakeAdapter } from "../stake";
import { sxbetAdapter } from "../sxbet";
import { tfAdapter } from "../tf";
import { xbetAdapter } from "../xbet";
import {
  betPlatformIds,
  collectPlatformIds,
  PLATFORM_REGISTRY,
  platformSupportsBet,
} from "./meta";
import { validateVenueTruth } from "./venueTruth";

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

/**
 * DEV ontology (Phase 3):
 * - collect/bet = Product Activation; collector/provider = Implementation
 * - Activation without Implementation → ERROR
 * - Implementation without Activation → ALLOWED (no warn)
 */
if (import.meta.env.DEV) {
  const report = validateVenueTruth({
    catalog: PLATFORM_REGISTRY,
    adapters: PLATFORM_ADAPTERS,
  });
  for (const err of report.errors)
    console.error(`[platform_adapter] ${err.message}`);
}
