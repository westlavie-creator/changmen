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
import { collectPlatformIds } from "@/platforms/registry";
import { useCollectStore } from "@/stores/collectStore";

type StopFn = () => void;
type CollectorFactory = () => StopFn;

const runners = new Map<PlatformId, StopFn>();

/** 与 platforms/registry 中 collect:true 的平台一一对应 */
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

if (import.meta.env.DEV) {
  const expected = new Set(collectPlatformIds());
  for (const id of Object.keys(COLLECTOR_FACTORIES) as PlatformId[]) {
    if (!expected.has(id)) {
      console.warn(`[collectors] 未在 registry 声明采集: ${id}`);
    }
  }
  for (const id of collectPlatformIds()) {
    if (!COLLECTOR_FACTORIES[id]) {
      console.warn(`[collectors] registry 声明采集但未注册 factory: ${id}`);
    }
  }
}

export async function startCollectors() {
  const collect = useCollectStore();
  if (!collect.ready) await collect.init();

  for (const [platform, factory] of Object.entries(COLLECTOR_FACTORIES) as [PlatformId, CollectorFactory][]) {
    syncCollector(platform, shouldRunCollector(platform, collect.isEnabled(platform)), factory);
  }
}

export function stopCollectors() {
  for (const stop of runners.values()) stop();
  runners.clear();
}

export function syncCollectorsFromConfig() {
  const collect = useCollectStore();
  for (const [platform, factory] of Object.entries(COLLECTOR_FACTORIES) as [PlatformId, CollectorFactory][]) {
    syncCollector(platform, shouldRunCollector(platform, collect.isEnabled(platform)), factory);
  }
}

/**
 * 配置开关语义是“是否上报保存到后端”，不应阻断 OB 实时赔率更新。
 * 因此 OB 采集器保持常驻，由内部 saveMatch/saveBets 决定是否上报。
 */
function shouldRunCollector(platform: PlatformId, reportEnabled: boolean) {
  if (platform === "OB") return true;
  return reportEnabled;
}

function syncCollector(platform: PlatformId, enabled: boolean, factory: CollectorFactory) {
  const prev = runners.get(platform);
  if (prev) {
    prev();
    runners.delete(platform);
  }
  if (enabled) runners.set(platform, factory());
}
