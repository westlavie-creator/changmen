import { computed, onMounted, onUnmounted, ref } from "vue";
import { probeGamebetExtension, readDomExtensionId } from "@/chrome-plugin/bridge";

const PROBE_INTERVAL_MS = 2000;

export function useExtensionGate() {
  const extensionStatus = ref<"installed" | "missing">("missing");
  const extensionVersion = ref("");
  const extensionId = ref("");
  const domExtensionId = ref("");
  const extensionReady = computed(() => extensionStatus.value === "installed");

  let probeTimer: ReturnType<typeof setInterval> | undefined;

  async function refreshExtension() {
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
    void refreshExtension();
    probeTimer = setInterval(() => {
      void refreshExtension();
    }, PROBE_INTERVAL_MS);
  });

  onUnmounted(() => {
    if (probeTimer) clearInterval(probeTimer);
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
