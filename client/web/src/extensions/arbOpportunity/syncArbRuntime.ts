import { watch } from "vue";
import { startMarketWatchLoop, stopMarketWatchLoop } from "@/extensions/arbMarketWatch";
import { useUserStore } from "@/stores/userStore";

export interface ArbRuntimeFlags {
  needMarketWatchLoop: boolean;
}

/** 纯函数：根据配置决定启停哪些旁路（便于单测） */
export function resolveArbRuntimeFlags(input: {
  betting: boolean;
  notifyArbOpportunity?: boolean;
}): ArbRuntimeFlags {
  const needMarketWatchLoop = !input.betting && input.notifyArbOpportunity === true;
  return { needMarketWatchLoop };
}

export function applyArbRuntimeState(flags: ArbRuntimeFlags): void {
  if (flags.needMarketWatchLoop)
    startMarketWatchLoop();
  else stopMarketWatchLoop();
}

export function syncArbRuntime(): void {
  const user = useUserStore();
  applyArbRuntimeState(
    resolveArbRuntimeFlags({
      betting: user.config.betting,
      notifyArbOpportunity: user.message?.notifyArbOpportunity,
    }),
  );
}

let stopWatch: (() => void) | null = null;

/** HomeView 挂载时安装：配置变化自动 sync（A8 主循环不受影响） */
export function installArbRuntimeSync(): void {
  if (stopWatch)
    return;
  const user = useUserStore();
  stopWatch = watch(
    () => ({
      betting: user.config.betting,
      notify: user.message?.notifyArbOpportunity === true,
    }),
    () => syncArbRuntime(),
  );
}

export function stopArbRuntime(): void {
  stopMarketWatchLoop();
}

export function teardownArbRuntimeSync(): void {
  stopWatch?.();
  stopWatch = null;
  stopArbRuntime();
}
