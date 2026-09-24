import { computed, onMounted, onUnmounted, ref } from "vue";
import { skipCertGate } from "@/config/mtlsGate";

type CertStatus = "unknown" | "present" | "absent";

/**
 * 探测本次页面是否经 mTLS（Caddy → /api/client-cert-status）。
 * 只在挂载时探测一次；用户装证后自行刷新即可。
 */
export function useCertGate() {
  const skipped = skipCertGate();
  const certStatus = ref<CertStatus>(skipped ? "present" : "unknown");
  const certSubject = ref("");
  const certReady = computed(() => certStatus.value === "present");
  const certChecked = computed(() => certStatus.value !== "unknown");

  let disposed = false;

  async function refreshCert(): Promise<boolean> {
    if (skipped) {
      certStatus.value = "present";
      return true;
    }

    try {
      const res = await fetch("/api/client-cert-status", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });
      if (res.ok) {
        const body = (await res.json()) as {
          hasClientCert?: boolean;
          subject?: string;
        };
        if (disposed)
          return false;
        if (body.hasClientCert) {
          certStatus.value = "present";
          certSubject.value = String(body.subject || "");
          return true;
        }
      }
    }
    catch {
      /* fall through to protocol hint */
    }

    if (disposed)
      return false;

    certStatus.value = "absent";
    certSubject.value = "";
    return false;
  }

  onMounted(() => {
    disposed = false;
    if (skipped)
      return;
    void refreshCert();
  });

  onUnmounted(() => {
    disposed = true;
  });

  return {
    certStatus,
    certSubject,
    certReady,
    certChecked,
    refreshCert,
  };
}
