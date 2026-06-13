import { computed, onMounted, onUnmounted, ref } from "vue";
import { probeGamebetExtension } from "@/extension/bridge";

const PROBE_INTERVAL_MS = 2000;

export function useExtensionGate() {
  const extensionStatus = ref<"checking" | "installed" | "missing">("checking");
  const extensionVersion = ref("");
  const extensionReady = computed(() => extensionStatus.value === "installed");

  let probeTimer: ReturnType<typeof setInterval> | undefined;

  async function refreshExtension() {
    const info = await probeGamebetExtension();
    if (info) {
      extensionStatus.value = "installed";
      extensionVersion.value = info.version ?? "";
      if (probeTimer) {
        clearInterval(probeTimer);
        probeTimer = undefined;
      }
      return true;
    }
    if (extensionStatus.value === "checking") {
      extensionStatus.value = "missing";
    }
    return false;
  }

  onMounted(async () => {
    const ok = await refreshExtension();
    if (!ok) {
      probeTimer = setInterval(() => {
        void refreshExtension();
      }, PROBE_INTERVAL_MS);
    }
  });

  onUnmounted(() => {
    if (probeTimer) clearInterval(probeTimer);
  });

  return { extensionStatus, extensionVersion, extensionReady, refreshExtension };
}
