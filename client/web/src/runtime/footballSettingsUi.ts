import { ref } from "vue";

export type FootballSettingsTab = "session" | "pod" | "trial";

/** 足球页专用设置弹窗。不进电竞 UserConfigDialog。 */
export const footballSettingsOpen = ref(false);
export const footballSettingsTab = ref<FootballSettingsTab>("session");

export function openFootballSettings(tab?: FootballSettingsTab) {
  if (tab)
    footballSettingsTab.value = tab;
  footballSettingsOpen.value = true;
}

export function closeFootballSettings() {
  footballSettingsOpen.value = false;
  footballSettingsTab.value = "session";
}
