import type { AxiosRequestConfig } from "axios";
import { ref } from "vue";
import { readEsportNetworkMs } from "@/api/esportNetworkMs";
import { a8Axios } from "@/shared/a8Axios";

/** [A8 可证实] bundle `Ut.delay = se()` */
export const delay = ref(0);

/** [A8 可证实] bundle `Ut.counter = se(0)` */
export const counter = ref(0);

/** [A8 可证实] bundle `Ar._lastTime` */
let lastTime = 0;

/** [A8 可证实] bundle `Ar._isDelay` */
let isDelay = false;

let delayInterceptorInstalled = false;

const ARM_INTERVAL_MS = 250;

export interface EsportDelaySampleMeta {
  startedAt: number;
  startedPerf: number;
  action: string;
  url: string;
}

declare module "axios" {
  interface AxiosRequestConfig {
    esportDelaySample?: EsportDelaySampleMeta;
  }
}

/** [A8 可证实] `Ar.post` 入口：`!_isDelay && o - _lastTime > 250` → `_isDelay=true, _lastTime=o` */
export function armEsportPostDelaySample(now = Date.now()) {
  if (!isDelay && now - lastTime > ARM_INTERVAL_MS) {
    isDelay = true;
    lastTime = now;
  }
}

/**
 * [changmen 扩展] XHR 响应到达时提交 delay（axios 拦截器），优先 Resource Timing。
 * A8 在 finally 用 Date.now()-o；changmen 主线程更重，finally 可晚于 Network 数秒。
 * Telegram SendMessage 与 A8 相同会进采样；真慢 ~700ms 时仍显示 ~700ms，不会误抬到几千。
 */
export function commitEsportPostDelaySample(meta: EsportDelaySampleMeta, now = Date.now()) {
  if (!isDelay)
    return;
  isDelay = false;
  const wall = now - meta.startedAt;
  const networkMs = readEsportNetworkMs(meta.action, meta.url, meta.startedPerf);
  delay.value = networkMs !== undefined ? networkMs : wall;
}

/** [A8 可证实] finally 仅 counter++；delay 已在响应拦截器提交 */
export function finalizeEsportPostDelaySample() {
  counter.value += 1;
}

function commitFromAxiosConfig(config?: AxiosRequestConfig) {
  const meta = config?.esportDelaySample;
  if (meta)
    commitEsportPostDelaySample(meta);
}

/** 注册一次：在 axios 处理响应时测 delay，不等到 executePost finally */
export function installEsportDelayResponseInterceptor() {
  if (delayInterceptorInstalled)
    return;
  delayInterceptorInstalled = true;
  a8Axios.interceptors.response.use(
    (response) => {
      commitFromAxiosConfig(response.config);
      return response;
    },
    (error) => {
      commitFromAxiosConfig(error.config);
      return Promise.reject(error);
    },
  );
}

/** 单测重置门控状态 */
export function resetEsportPostDelayStateForTest() {
  lastTime = 0;
  isDelay = false;
  delay.value = 0;
  counter.value = 0;
}
