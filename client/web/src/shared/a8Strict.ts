import { computed, ref } from "vue";

const STORAGE_KEY = "A8_STRICT";

/** 严格 A8 模式（关闭 changmen 增强）。响应式，供 UI 绑定。 */
const strictRef = ref(readInitialStrict());

function readInitialStrict(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "1") return true;
    if (raw === "0") return false;
  } catch {
    // ignore
  }
  return String(import.meta.env.VITE_A8_STRICT ?? "") === "1";
}

/**
 * 严格 A8 模式：关闭 changmen 的所有增强项，确保除增强外行为/界面与 A8 一致。
 *
 * 开关优先级：localStorage `A8_STRICT` > Vite env `VITE_A8_STRICT`
 */
export function isA8StrictMode(): boolean {
  return strictRef.value;
}

export const strictA8Mode = computed(() => strictRef.value);

/** 增强模式开启 = 非严格 A8（默认开启） */
export const enhancementModeEnabled = computed({
  get: () => !strictRef.value,
  set: (enabled: boolean) => setEnhancementMode(enabled),
});

export function setEnhancementMode(enabled: boolean): void {
  strictRef.value = !enabled;
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "0" : "1");
  } catch {
    // ignore
  }
}
