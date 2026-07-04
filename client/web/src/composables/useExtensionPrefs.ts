import { storeToRefs } from "pinia";
import { computed } from "vue";
import { useUserStore } from "@/stores/userStore";

/** BetRow 扩展 UI（套利划线 / flash / EV）是否启用 */
export function useBetRowExtensionUiEnabled() {
  const { extensionPrefs } = storeToRefs(useUserStore());
  return computed(() => extensionPrefs.value.betRowUi === true);
}
