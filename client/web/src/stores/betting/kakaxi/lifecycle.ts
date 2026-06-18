import { startKakaxiDetectFeed, stopKakaxiDetectFeed } from "@/stores/betting/kakaxi/detectFeed";
import { clearKakaxiQueue } from "@/stores/betting/kakaxi/queue";
import { resetKakaxiScheduler } from "@/stores/betting/kakaxi/scheduler";

/** 启动 kakaxi：赔率 detect 入队（执行由 runKakaxiArbRound 消费） */
export function startKakaxiRuntime(): void {
  startKakaxiDetectFeed();
}

export function stopKakaxiRuntime(): void {
  stopKakaxiDetectFeed();
  clearKakaxiQueue();
  resetKakaxiScheduler();
}
