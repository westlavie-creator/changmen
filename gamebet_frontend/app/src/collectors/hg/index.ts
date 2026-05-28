import { PLATFORMS } from "@/shared/platform";
import { wait } from "@/shared/wait";
import { useCollectStore } from "@/stores/collectStore";

const POLL_MS = 60_000;

/**
 * 皇冠 HG 无标准电竞实时赔率流（对齐 backend hg_feed.js）。
 * A8 SQ 为跟单下注循环，非 saveMatch 采集；此处仅占位并提示配置账号。
 */
export function startHgCollector(): () => void {
  let stopped = false;

  const poll = async () => {
    const collect = useCollectStore();
    while (!stopped) {
      if (collect.isEnabled(PLATFORMS.HG)) {
        console.debug("[HG] 无独立赔率采集；请通过插件跟单或账号余额接口使用");
      }
      await wait(POLL_MS);
    }
  };

  void poll();

  return () => {
    stopped = true;
  };
}
