import { ref } from "vue";
import { readEsportNetworkMs } from "@/api/esportNetworkMs";

/** [A8 可证实] bundle `Ut.delay = se()` */
export const delay = ref(0);

/** [A8 可证实] bundle `Ut.counter = se(0)` */
export const counter = ref(0);

/** [A8 可证实] bundle `Ar._lastTime` */
let lastTime = 0;

/** [A8 可证实] bundle `Ar._isDelay` */
let isDelay = false;

const ARM_INTERVAL_MS = 250;

/** [A8 可证实] `Ar.post` 入口：`!_isDelay && o - _lastTime > 250` → `_isDelay=true, _lastTime=o` */
export function armEsportPostDelaySample(now = Date.now()) {
  if (!isDelay && now - lastTime > ARM_INTERVAL_MS) {
    isDelay = true;
    lastTime = now;
  }
}

/**
 * [A8 可证实] `Ar.post` finally：
 * `Ut.counter.value++`；`_isDelay && (_isDelay=false, Ut.delay=Date.now()-o)`
 *
 * [changmen 扩展] 若 Resource Timing 显示网络段明显短于 wall（主线程阻塞 finally），
 * 用网络耗时对齐 DevTools Network，避免误显示 2000+ms。
 */
export function finalizeEsportPostDelaySample(
  startedAt: number,
  startedPerf: number,
  action: string,
  now = Date.now(),
) {
  counter.value += 1;
  if (isDelay) {
    isDelay = false;
    const wall = now - startedAt;
    const networkMs = readEsportNetworkMs(action, startedPerf);
    delay.value = networkMs !== undefined && networkMs < wall ? networkMs : wall;
  }
}

/** 单测重置门控状态 */
export function resetEsportPostDelayStateForTest() {
  lastTime = 0;
  isDelay = false;
  delay.value = 0;
  counter.value = 0;
}
