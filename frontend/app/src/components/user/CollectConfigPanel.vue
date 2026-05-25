<script setup lang="ts">
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import type { PlatformId } from "@/types/esport";
import { ALL_PLATFORMS } from "@/types/userConfig";
import { useCollectStore } from "@/stores/collectStore";
import { useUserStore } from "@/stores/userStore";
import {
  CREDIT_PLATE_ENTRIES,
  enterCreditPlate,
} from "@/services/creditPlate";

defineProps<{ embedded?: boolean }>();

const collect = useCollectStore();
const user = useUserStore();
const { log } = storeToRefs(collect);

/** 对齐 bundle `n`：默认 true，采集开关不可编辑；双击「盘」切换 */
const switchesDisabled = ref(true);
const entering = ref(false);

const platformRows = computed(() =>
  ALL_PLATFORMS.map((id) => [id, collect.isEnabled(id)] as [PlatformId, boolean]),
);

function toggleSwitchesLock() {
  switchesDisabled.value = !switchesDisabled.value;
}

async function toggleLog() {
  if (switchesDisabled.value) return;
  await collect.saveConfig({ log: !log.value });
}

async function togglePlatform(platform: PlatformId) {
  if (switchesDisabled.value) return;
  const next = new Map(collect.collect);
  next.set(platform, !next.get(platform));
  await collect.saveConfig({ collect: next });
  const { syncCollectorsFromConfig } = await import("@/collectors");
  syncCollectorsFromConfig();
}

async function openCredit(platform: PlatformId) {
  entering.value = true;
  try {
    await enterCreditPlate(platform, user.userName);
  } finally {
    entering.value = false;
  }
}
</script>

<template>
  <section class="collect-panel">
    <div class="providers">
      <label class="provider-switch" :class="{ 'is-disabled': switchesDisabled }">
        <input
          type="checkbox"
          :checked="log"
          :disabled="switchesDisabled"
          @change="toggleLog"
        />
        <span class="provider-switch__label">采集日志</span>
      </label>
      <label
        v-for="[id, on] in platformRows"
        :key="id"
        class="provider-switch provider"
        :class="{ 'is-disabled': switchesDisabled }"
      >
        <input
          type="checkbox"
          :checked="on"
          :disabled="switchesDisabled"
          @change="togglePlatform(id)"
        />
        <span class="provider-switch__label">{{ id }}</span>
      </label>
    </div>

    <div class="credit-divider">
      信用<span class="credit-divider__unlock" @dblclick="toggleSwitchesLock">盘</span>入口
    </div>

    <div class="credit">
      <button
        v-for="entry in CREDIT_PLATE_ENTRIES"
        :key="entry.id"
        type="button"
        class="credit-btn"
        @click="openCredit(entry.id)"
      >
        <span class="flex flex-middle">
          <span class="provider-icon" :class="entry.id" />
          <span class="name">{{ entry.label }}</span>
        </span>
      </button>
    </div>

    <div v-if="entering" class="credit-loading">正在进入游戏</div>
  </section>
</template>

<style scoped>
.collect-panel {
  padding: 12px 14px;
  border-bottom: 1px solid #ffffff14;
  position: relative;
}

.providers {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 10px;
}

.provider-switch {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #cbd5e1;
  cursor: pointer;
  user-select: none;
}

.provider-switch.is-disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.provider-switch input {
  accent-color: #409eff;
}

.credit-divider {
  margin: 14px 0 10px;
  padding-top: 10px;
  border-top: 1px solid #ffffff14;
  text-align: center;
  font-size: 12px;
  color: #94a3b8;
}

.credit-divider__unlock {
  cursor: pointer;
  color: #e2e8f0;
}

.credit {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: space-between;
}

.credit-btn {
  flex: 1 1 30%;
  min-width: 96px;
  padding: 8px 10px;
  border: none;
  border-radius: 4px;
  background: #409eff;
  color: #fff;
  font-size: 12px;
  cursor: pointer;
}

.credit-btn:hover {
  background: #66b1ff;
}

.credit-btn .provider-icon {
  width: 18px;
  height: 18px;
  margin-right: 6px;
  flex-shrink: 0;
}

.credit-btn .name {
  white-space: nowrap;
}

.credit-loading {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  font-size: 14px;
}
</style>
