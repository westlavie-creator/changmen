import { ref } from "vue";

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
 */
export function finalizeEsportPostDelaySample(startedAt: number, now = Date.now()) {
  counter.value += 1;
  if (isDelay) {
    isDelay = false;
    delay.value = now - startedAt;
  }
}

/** 单测重置门控状态 */
export function resetEsportPostDelayStateForTest() {
  lastTime = 0;
  isDelay = false;
  delay.value = 0;
  counter.value = 0;
}
