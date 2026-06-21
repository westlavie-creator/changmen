/**
 * OB MQTT 模式切换：A8 模式（按场订阅）↔ 官网模式（全局订阅）。
 * 同一时刻只有一种模式在工作。
 */
import { ref } from "vue";
import { startObGlobalMqtt, stopObGlobalMqtt, isObGlobalMqttConnected } from "./globalMqtt";
import { setFoIngestOnlyNew } from "./markets";

export type ObMqttMode = "a8" | "official";

const currentMode = ref<ObMqttMode>("official");
const switching = ref(false);

export function getObMqttMode() {
  return currentMode;
}

export function isObMqttSwitching() {
  return switching;
}

export async function switchObMqttMode(target: ObMqttMode): Promise<void> {
  if (currentMode.value === target || switching.value) return;
  switching.value = true;

  try {
    if (target === "official") {
      startObGlobalMqtt();
      setFoIngestOnlyNew(true);
      currentMode.value = "official";
      console.info("[OB MQTT] switched to official (global + per-match, HTTP only writes new oddIds)");
    } else {
      stopObGlobalMqtt();
      setFoIngestOnlyNew(false);
      currentMode.value = "a8";
      console.info("[OB MQTT] switched to A8 (per-match only, HTTP overwrites fo)");
    }
  } finally {
    switching.value = false;
  }
}

export function isObGlobalConnected(): boolean {
  return currentMode.value === "official" && isObGlobalMqttConnected();
}
