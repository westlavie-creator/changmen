import { ref } from "vue";

/** 足球页专用设置弹窗。不进电竞 UserConfigDialog。 */
export const footballSettingsOpen = ref(false);

export function openFootballSettings() {
  footballSettingsOpen.value = true;
}

export function closeFootballSettings() {
  footballSettingsOpen.value = false;
}
