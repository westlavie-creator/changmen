import { startObCollector } from "@/collectors/ob";
import { startRayCollector } from "@/collectors/ray";
import { startTfCollector } from "@/collectors/tf";
import { startIaCollector } from "@/collectors/ia";
import { startPbCollector } from "@/collectors/pb";
import { startImtCollector } from "@/collectors/imt";
import { startSabaCollector } from "@/collectors/saba";
import { startImCollector } from "@/collectors/im";
import { startXbetCollector } from "@/collectors/xbet";
import { startStakeCollector } from "@/collectors/stake";
import { startHgCollector } from "@/collectors/hg";
import type { PlatformId } from "@/types/esport";
import { useCollectStore } from "@/stores/collectStore";

type StopFn = () => void;
type CollectorFactory = () => StopFn;

const runners = new Map<PlatformId, StopFn>();

const COLLECTOR_FACTORIES: Partial<Record<PlatformId, CollectorFactory>> = {
  OB: startObCollector,
  RAY: startRayCollector,
  TF: startTfCollector,
  IA: startIaCollector,
  IM: startImCollector,
  SABA: startSabaCollector,
  XBet: startXbetCollector,
  PB: startPbCollector,
  IMT: startImtCollector,
  HG: startHgCollector,
  Stake: startStakeCollector,
};

export async function startCollectors() {
  const collect = useCollectStore();
  if (!collect.ready) await collect.init();

  for (const [platform, factory] of Object.entries(COLLECTOR_FACTORIES) as [PlatformId, CollectorFactory][]) {
    syncCollector(platform, collect.isEnabled(platform), factory);
  }
}

export function stopCollectors() {
  for (const stop of runners.values()) stop();
  runners.clear();
}

export function syncCollectorsFromConfig() {
  const collect = useCollectStore();
  for (const [platform, factory] of Object.entries(COLLECTOR_FACTORIES) as [PlatformId, CollectorFactory][]) {
    syncCollector(platform, collect.isEnabled(platform), factory);
  }
}

function syncCollector(platform: PlatformId, enabled: boolean, factory: CollectorFactory) {
  const prev = runners.get(platform);
  if (prev) {
    prev();
    runners.delete(platform);
  }
  if (enabled) runners.set(platform, factory());
}
