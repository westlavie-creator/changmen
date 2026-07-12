import { setVenueWebBridge } from "@changmen/venue-adapter/shared/webBridge";
import type { VenueWebBridge } from "@changmen/venue-adapter/shared/webBridgeTypes";
import { useAccountStore } from "@/stores/accountStore";
import { useCollectStore } from "@/stores/collectStore";
import { useMatchStore } from "@/stores/matchStore";
import { useMessageStore } from "@/stores/messageStore";
import { useUserStore } from "@/stores/userStore";

/** 将 web Pinia store 注入 venue-adapter（须在 createPinia 之后调用） */
export function installVenueWebBridge() {
  const hooks: VenueWebBridge = {
    useCollectStore: () => useCollectStore(),
    useMatchStore: () => useMatchStore(),
    useMessageStore: () => useMessageStore(),
    useAccountStore: () => useAccountStore(),
    useUserStore: () => useUserStore(),
  };
  setVenueWebBridge(hooks);
}

export function clearVenueWebBridge() {
  setVenueWebBridge(null);
}
