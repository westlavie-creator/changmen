import { computed, onMounted, onUnmounted, ref } from "vue";
import { skipCertGate } from "@/config/mtlsGate";

const PROBE_INTERVAL_MS = 3000;

type CertStatus = "unknown" | "present" | "absent";

/**
 * 探测本次页面是否经 mTLS（Caddy → /api/client-cert-status）。
 * 生产 HTTPS + require_and_verify 下，协议为 https 也可作兜底（Caddy 尚未注入头时）。
 */
export function useCertGate() {
  const skipped = skipCertGate();
  const certStatus = ref<CertStatus>(skipped ? "present" : "unknown");
  const certSubject = ref("");
  const certReady = computed(() => certStatus.value === "present");
  const certChecked = computed(() => certStatus.value !== "unknown");

  let probeTimer: ReturnType<typeof setInterval> | undefined;
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

    // Caddy 尚未注入证头时 API 恒为 false：生产 https（:443 require_and_verify）仍视为有证。
    // 一旦 Caddy 按 dual.example 注入头，有证会走上面 early return；无证只会来自 :80。
    if (import.meta.env.PROD && typeof location !== "undefined" && location.protocol === "https:") {
      certStatus.value = "present";
      return true;
    }

    certStatus.value = "absent";
    certSubject.value = "";
    return false;
  }

  onMounted(() => {
    disposed = false;
    if (skipped)
      return;
    void refreshCert();
    probeTimer = setInterval(() => {
      void refreshCert();
    }, PROBE_INTERVAL_MS);
  });

  onUnmounted(() => {
    disposed = true;
    if (probeTimer)
      clearInterval(probeTimer);
  });

  return {
    certStatus,
    certSubject,
    certReady,
    certChecked,
    refreshCert,
  };
}
