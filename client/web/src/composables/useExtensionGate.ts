import { computed, onMounted, onUnmounted, ref } from "vue";
import { probeGamebetExtension, readDomExtensionId } from "@changmen/client-core/chrome-plugin/bridge";
import { skipExtensionGate } from "@/config/gamebetExtension";

const PROBE_INTERVAL_MS = 2000;
const DEV_SKIP_VERSION = "local-skip";

export function useExtensionGate() {
  const devSkip = skipExtensionGate();
  const extensionStatus = ref<"installed" | "missing">(devSkip ? "installed" : "missing");
  const extensionVersion = ref(devSkip ? DEV_SKIP_VERSION : "");
  const extensionId = ref(devSkip ? "dev-skip" : "");
  const domExtensionId = ref("");
  const extensionReady = computed(() => extensionStatus.value === "installed");

  let probeTimer: ReturnType<typeof setInterval> | undefined;

  async function refreshExtension() {
    if (devSkip) {
      extensionStatus.value = "installed";
      extensionVersion.value = DEV_SKIP_VERSION;
      extensionId.value = "dev-skip";
      return true;
    }

    domExtensionId.value = readDomExtensionId();
    const info = await probeGamebetExtension();
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
    if (devSkip)
      return;
    void refreshExtension();
    probeTimer = setInterval(() => {
      void refreshExtension();
    }, PROBE_INTERVAL_MS);
  });

  onUnmounted(() => {
    if (probeTimer)
      clearInterval(probeTimer);
  });

  return {
    extensionStatus,
    extensionVersion,
    extensionId,
    domExtensionId,
    extensionReady,
    refreshExtension,
  };
}
