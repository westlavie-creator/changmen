import { obPlugin } from "@/platforms/ob";
import { rayPlugin } from "@/platforms/ray";
import { tfPlugin } from "@/platforms/tf";
import { iaPlugin } from "@/platforms/ia";
import { pbPlugin } from "@/platforms/pb";
import { imtPlugin } from "@/platforms/imt";
import { sabaPlugin } from "@/platforms/saba";
import { imPlugin } from "@/platforms/im";
import { xbetPlugin } from "@/platforms/xbet";
import { stakePlugin } from "@/platforms/stake";
import { hgPlugin } from "@/platforms/hg";
import type { PlatformId } from "@/types/esport";
import type { CollectorFactory } from "@/platforms/types";
import { collectPlatformIds } from "@/platforms/registry";
import { useCollectStore } from "@/stores/collectStore";

type StopFn = () => void;

const runners = new Map<PlatformId, StopFn>();

/** 与 platforms/registry 中 collect:true 的平台一一对应 */
const COLLECTOR_FACTORIES: Partial<Record<PlatformId, CollectorFactory>> = {
  OB: obPlugin.collector,
  RAY: rayPlugin.collector,
  TF: tfPlugin.collector,
  IA: iaPlugin.collector,
  IM: imPlugin.collector,
  SABA: sabaPlugin.collector,
  XBet: xbetPlugin.collector,
  PB: pbPlugin.collector,
  IMT: imtPlugin.collector,
  HG: hgPlugin.collector,
  Stake: stakePlugin.collector,
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
    syncCollector(platform, true, factory);
  }
}

export function stopCollectors() {
  for (const stop of runners.values()) stop();
  runners.clear();
}

export function syncCollectorsFromConfig() {
  const collect = useCollectStore();
  if (!collect.ready) return;
  for (const [platform, factory] of Object.entries(COLLECTOR_FACTORIES) as [PlatformId, CollectorFactory][]) {
    if (!runners.has(platform)) {
      syncCollector(platform, true, factory);
    }
  }
}

/** 用户中心「赛事采集」开关仅控制 collectStore.saveMatch/saveBets，不用于启停采集器。 */

function syncCollector(platform: PlatformId, enabled: boolean, factory: CollectorFactory) {
  const prev = runners.get(platform);
  if (prev) {
    prev();
    runners.delete(platform);
  }
  if (enabled) runners.set(platform, factory());
}
