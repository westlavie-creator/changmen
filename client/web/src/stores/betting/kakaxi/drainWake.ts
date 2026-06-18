import { KAKAXI_DRAIN_WAKE_DEBOUNCE_MS } from "@/stores/betting/kakaxi/config";
import { kakaxiQueueSize } from "@/stores/betting/kakaxi/queue";
import { drainKakaxiScheduler } from "@/stores/betting/kakaxi/scheduler";
import { useBettingStore } from "@/stores/bettingStore";
import { useConfigStore } from "@/stores/configStore";

let wakeTimer: ReturnType<typeof setTimeout> | undefined;
let wantsUrgent = false;

/** detect 入队后唤醒 drain，不必等主循环 100ms */
export function wakeKakaxiDrain(urgent = false): void {
  if (!useConfigStore().config.betting) return;
  if (urgent) wantsUrgent = true;
  scheduleDrainWake();
}

function scheduleDrainWake(): void {
  const delay = wantsUrgent ? 0 : KAKAXI_DRAIN_WAKE_DEBOUNCE_MS;
  if (wakeTimer !== undefined) {
    if (!wantsUrgent) return;
    clearTimeout(wakeTimer);
    wakeTimer = undefined;
  }

  wakeTimer = setTimeout(() => {
    wakeTimer = undefined;
    const urgent = wantsUrgent;
    wantsUrgent = false;
    void runWakeDrain(urgent);
  }, delay);
}

async function runWakeDrain(wasUrgent: boolean): Promise<void> {
  if (kakaxiQueueSize() === 0) return;

  const bettingStore = useBettingStore();
  const processed = await drainKakaxiScheduler({
    setMessage: (msg) => bettingStore.setMessage(msg),
  });

  if (processed > 0 && kakaxiQueueSize() > 0) {
    wakeKakaxiDrain(wasUrgent);
  }
}

export function resetKakaxiDrainWake(): void {
  if (wakeTimer !== undefined) clearTimeout(wakeTimer);
  wakeTimer = undefined;
  wantsUrgent = false;
}
