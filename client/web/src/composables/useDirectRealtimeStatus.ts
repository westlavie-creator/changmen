import { onMounted, onUnmounted, ref } from "vue";
import {
  listDirectRealtimeStatuses,
  subscribeDirectRealtimeStatus,
  type DirectRealtimeStatus,
} from "@platform/shared/directRealtimeStatus";

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
