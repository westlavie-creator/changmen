import { onMounted, onUnmounted, ref } from "vue";
import {
  currentOrderSoundUserName,
  isOrderSoundPlaying,
  previewOrderSound,
  stopOrderSound,
  subscribeOrderSoundState,
} from "@/shared/orderSound";

/** 设置页试听：订阅引擎播放状态，提供 preview / stop */
export function useOrderSoundPlayer(userName = currentOrderSoundUserName) {
  const playing = ref(false);

  let unsubscribe: (() => void) | undefined;

  function syncPlaying() {
    playing.value = isOrderSoundPlaying();
  }

  onMounted(() => {
    syncPlaying();
    unsubscribe = subscribeOrderSoundState(syncPlaying);
  });

  onUnmounted(() => {
    unsubscribe?.();
    void stopOrderSound();
  });

  async function preview() {
    await previewOrderSound(userName());
  }

  async function stop() {
    await stopOrderSound();
  }

  return {
    playing,
    preview,
    stop,
  };
}
