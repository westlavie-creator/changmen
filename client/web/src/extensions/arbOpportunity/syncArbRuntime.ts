import { watch } from "vue";
import { startMarketWatchLoop, stopMarketWatchLoop } from "@/extensions/arbMarketWatch";
import {
  startKakaxiRuntime,
  stopKakaxiRuntime,
} from "@/stores/betting/kakaxi/lifecycle";
import { useConfigStore } from "@/stores/configStore";
import { useUserStore } from "@/stores/userStore";
import { usesKakaxiArbDetectEngine } from "@/types/arbDetectEngine";

export interface ArbRuntimeFlags {
  needMarketWatchLoop: boolean;
  needKakaxiRuntime: boolean;
}

/** 纯函数：根据配置决定启停哪些旁路（便于单测） */
export function resolveArbRuntimeFlags(input: {
  betting: boolean;
  arbDetectEngine?: string;
  notifyArbOpportunity?: boolean;
}): ArbRuntimeFlags {
  const needMarketWatchLoop = !input.betting && input.notifyArbOpportunity === true;
  const needKakaxiRuntime
    = Boolean(input.betting)
      && usesKakaxiArbDetectEngine({ arbDetectEngine: input.arbDetectEngine as "a8" | "kakaxi" });
  return { needMarketWatchLoop, needKakaxiRuntime };
}

export function applyArbRuntimeState(flags: ArbRuntimeFlags): void {
  if (flags.needMarketWatchLoop)
    startMarketWatchLoop();
  else stopMarketWatchLoop();

  if (flags.needKakaxiRuntime)
    startKakaxiRuntime();
  else stopKakaxiRuntime();
}

export function syncArbRuntime(): void {
  const configStore = useConfigStore();
  const user = useUserStore();
  applyArbRuntimeState(
    resolveArbRuntimeFlags({
      betting: configStore.config.betting,
      arbDetectEngine: configStore.config.arbDetectEngine,
      notifyArbOpportunity: user.message?.notifyArbOpportunity,
    }),
  );
}

let stopWatch: (() => void) | null = null;

/** HomeView 挂载时安装：配置变化自动 sync（A8 主循环不受影响） */
export function installArbRuntimeSync(): void {
  if (stopWatch)
    return;
  const configStore = useConfigStore();
  const user = useUserStore();
  stopWatch = watch(
    () => ({
      betting: configStore.config.betting,
      engine: configStore.config.arbDetectEngine,
      notify: user.message?.notifyArbOpportunity === true,
    }),
    () => syncArbRuntime(),
  );
}

export function stopArbRuntime(): void {
  stopMarketWatchLoop();
  stopKakaxiRuntime();
}

export function teardownArbRuntimeSync(): void {
  stopWatch?.();
  stopWatch = null;
  stopArbRuntime();
}
