import type { DirectRealtimeStatus } from "@venue/shared/directRealtimeStatus";
import {

  listDirectRealtimeStatuses,
  subscribeDirectRealtimeStatus,
} from "@venue/shared/directRealtimeStatus";
import { onMounted, onUnmounted, ref } from "vue";

export function useDirectRealtimeStatus() {
  const statuses = ref<DirectRealtimeStatus[]>(listDirectRealtimeStatuses());
  let unsubscribe: (() => void) | null = null;

  onMounted(() => {
    unsubscribe = subscribeDirectRealtimeStatus(() => {
      statuses.value = listDirectRealtimeStatuses();
    });
  });

  onUnmounted(() => {
    unsubscribe?.();
    unsubscribe = null;
  });

  return { statuses };
}
