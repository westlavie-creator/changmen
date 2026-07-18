import { computed, onMounted, onUnmounted, ref } from "vue";
import { probeGamebetExtension, readDomExtensionId } from "@changmen/client-core/chrome-plugin/bridge";
import { skipExtensionGate } from "@/config/gamebetExtension";

const PROBE_INTERVAL_MS = 2000;
const DEV_SKIP_VERSION = "local-skip";

export function useExtensionGate() {
  const devSkip = skipExtensionGate();
  /** pending：尚未完成首次探测，避免 Gate 误闪 Coming soon */
  const extensionStatus = ref<"pending" | "installed" | "missing">(devSkip ? "installed" : "pending");
  const extensionVersion = ref(devSkip ? DEV_SKIP_VERSION : "");
  const extensionId = ref(devSkip ? "dev-skip" : "");
  const domExtensionId = ref("");
  const extensionReady = computed(() => extensionStatus.value === "installed");
  const extensionChecked = computed(() => extensionStatus.value !== "pending");

  let probeTimer: ReturnType<typeof setInterval> | undefined;
  let disposed = false;

  async function refreshExtension() {
    if (devSkip) {
      extensionStatus.value = "installed";
      extensionVersion.value = DEV_SKIP_VERSION;
      extensionId.value = "dev-skip";
      return true;
    }

    domExtensionId.value = readDomExtensionId();
    const info = await probeGamebetExtension();
    if (disposed)
      return false;
    if (info) {
      extensionStatus.value = "installed";
      extensionVersion.value = info.version ?? "";
      extensionId.value = info.extensionId ?? domExtensionId.value;
      if (probeTimer) {
        clearInterval(probeTimer);
        probeTimer = undefined;
      }
      return true;
    }
    extensionStatus.value = "missing";
    return false;
  }

  onMounted(() => {
    disposed = false;
    if (devSkip)
      return;
    void refreshExtension();
    probeTimer = setInterval(() => {
      void refreshExtension();
    }, PROBE_INTERVAL_MS);
  });

  onUnmounted(() => {
    disposed = true;
    if (probeTimer)
      clearInterval(probeTimer);
  });

  return {
    extensionStatus,
    extensionVersion,
    extensionId,
    domExtensionId,
    extensionReady,
    extensionChecked,
    refreshExtension,
  };
}
