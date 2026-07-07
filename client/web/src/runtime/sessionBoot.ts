import "@/stores/account/polymarketVenueSync";
import { useCollectStore } from "@/stores/collectStore";
import { useLoseOrderStore } from "@/stores/loseOrderStore";
import { useUserStore } from "@/stores/userStore";

let sessionBooted = false;

/** [A8 可证实] 采集/HG 跟单在 SPA bundle（index.js）内启动，扩展 background 仅 HTTP 中继 */
export async function bootSessionRuntime(): Promise<void> {
  if (sessionBooted)
    return;
  sessionBooted = true;
  useLoseOrderStore().init();
  const collectStore = useCollectStore();
  const userStore = useUserStore();
  await Promise.all([collectStore.init(), userStore.loadConfig()]);
  const { startCollectors } = await import("@/runtime/collectors");
  await startCollectors();
  const [{ primeStakeTabId }, { startHgFollowLoop }] = await Promise.all([
    import("@venue/stake"),
    import("@venue/hg"),
  ]);
  primeStakeTabId();
  startHgFollowLoop();
}

export function stopSessionRuntime(): void {
  if (!sessionBooted)
    return;
  sessionBooted = false;
  void import("@venue/hg").then(({ stopHgFollowLoop }) => stopHgFollowLoop());
  void import("@/runtime/collectors").then(({ stopCollectors }) => stopCollectors());
}
