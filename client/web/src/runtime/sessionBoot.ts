import "@/stores/account/polymarketVenueSync";
import { useCollectStore } from "@/stores/collectStore";
import { useLoseOrderStore } from "@/stores/loseOrderStore";
import { useUserStore } from "@/stores/userStore";

let sessionBooted = false;

/** 采集在 SPA 内启动；HG 跟单已暂停 */
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
  const { primeStakeTabId } = await import("@changmen/venue-adapter/stake");
  primeStakeTabId();
}

export function stopSessionRuntime(): void {
  if (!sessionBooted)
    return;
  sessionBooted = false;
  void import("@/runtime/collectors").then(({ stopCollectors }) => stopCollectors());
}
