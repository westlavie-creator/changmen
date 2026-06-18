import { startKakaxiDetectFeed, stopKakaxiDetectFeed } from "@/stores/betting/kakaxi/detectFeed";
import { clearKakaxiCooldowns } from "@/stores/betting/kakaxi/cooldown";
import { resetKakaxiDrainWake } from "@/stores/betting/kakaxi/drainWake";
import { invalidatePlatformBetLookupCache } from "@/stores/betting/kakaxi/incrementalDetect";
import { clearKakaxiQueue } from "@/stores/betting/kakaxi/queue";
import { armKakaxiScheduler, resetKakaxiScheduler } from "@/stores/betting/kakaxi/scheduler";

/** 启动 kakaxi：赔率 detect 入队（执行由 runKakaxiArbRound 消费） */
export function startKakaxiRuntime(): void {
  armKakaxiScheduler();
  startKakaxiDetectFeed();
}

export function stopKakaxiRuntime(): void {
  stopKakaxiDetectFeed();
  resetKakaxiDrainWake();
  resetKakaxiScheduler();
  invalidatePlatformBetLookupCache();
  clearKakaxiQueue();
  clearKakaxiCooldowns();
}
